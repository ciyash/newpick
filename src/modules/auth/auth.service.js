
import bcrypt from "bcrypt";
import db from "../../config/db.js";
import redis from "../../config/redis.js";
import crypto from "crypto";
import nodemailer from "nodemailer";
import generateUserCode from "../../utils/usercode.js";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});
export const requestSignupOtpService = async (data) => {
  const { name, email, mobile, region, address, dob, referralid, password } = data;

  const birthDate = new Date(dob);
  const age = new Date(Date.now() - birthDate.getTime()).getUTCFullYear() - 1970;
  if (age < 18) throw new Error("You must be at least 18 years old");

  const [[emailExists]] = await db.query(
    "SELECT id FROM users WHERE email = ?",
    [email]
  );
  if (emailExists) throw new Error("Email already registered");

  const [[mobileExists]] = await db.query(
    "SELECT id FROM users WHERE mobile = ?",
    [mobile]
  );
  if (mobileExists) throw new Error("Mobile already registered");
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  await redis.set(`SIGNUP:${mobile}`, JSON.stringify({
    name,
    email,
    mobile,
    region,
    address,
    dob,
    referralid,
    password
  }), { ex: 300 });

  await redis.set(`SIGNUP_OTP:${mobile}`, otp, { ex: 3000 });
console.log(` SIGNUP OTP for ${mobile}: ${otp}`);

  //  Send OTP (SMS gateway here)
  // sendSms(mobile, otp);

  return {
    success: true,
    message: "OTP sent to mobile number"
  };
};

export const signupService = async ({ mobile, otp }) => {
  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  const savedOtpRaw = await redis.get(`SIGNUP_OTP:${normalizedMobile}`);

  console.log(" OTP DEBUG", {
    inputOtp: otp,
    inputType: typeof otp,
    redisOtp: savedOtpRaw,
    redisType: typeof savedOtpRaw,
    mobile: normalizedMobile
  });

  if (!savedOtpRaw) throw new Error("OTP expired");

  const inputOtp = String(otp).trim();
  const savedOtp = String(savedOtpRaw).trim();

  if (savedOtp !== inputOtp) throw new Error("Invalid OTP");

  const signupDataRaw = await redis.get(`SIGNUP:${normalizedMobile}`);
  if (!signupDataRaw) throw new Error("Signup session expired");

  const signupData =
    typeof signupDataRaw === "string"
      ? JSON.parse(signupDataRaw)
      : signupDataRaw;

  const { name, email, region, address, dob, referralid, password } = signupData;

  const hashedPassword = await bcrypt.hash(password, 10);

  
  let usercode;
  while (true) {
    usercode = generateUserCode();
    const [[exists]] = await db.query(
      "SELECT id FROM users WHERE usercode = ?",
      [usercode]
    );
    if (!exists) break;
  }

  const [[lastUser]] = await db.query(
    "SELECT userid FROM users ORDER BY id DESC LIMIT 1"
  );

  let newUserId;
  if (!lastUser || !lastUser.userid) {
    newUserId = "PTW000001";
  } else {
    const lastNumber = parseInt(lastUser.userid.replace("PTW", ""), 10);
    const nextNumber = lastNumber + 1;
    newUserId = "PTW" + nextNumber.toString().padStart(6, "0");
  }

  let referralUserId = null;
  if (referralid && referralid !== "AAAAA1111") {
    const [[refUser]] = await db.query(
      "SELECT usercode FROM users WHERE usercode = ?",
      [referralid]
    );
    if (!refUser) throw new Error("Invalid referral code");
    referralUserId = referralid;
  }

  const emailToken = crypto.randomBytes(20).toString("hex");

  await db.query(
    `INSERT INTO users
     (userid, usercode, name, email, mobile, region, address, dob,
      referalid, password, email_token, phoneverify, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
    [
      newUserId,
      usercode,
      name,
      email,
      normalizedMobile,
      region,
      address,
      dob,
      referralUserId,
      hashedPassword,
      emailToken
    ]
  );

  await redis.del(`SIGNUP:${normalizedMobile}`);
  await redis.del(`SIGNUP_OTP:${normalizedMobile}`);
  
 const verificationUrl = `${process.env.FRONTEND_URL}/email-verified?token=${emailToken}`;

await transporter.sendMail({
  from: process.env.SMTP_USER,
  to: email,
  subject: "Verify your email",
  html: `<p>Hi ${name},</p>
         <p>Click the button below to verify your email:</p>
         <a href="${verificationUrl}" style="padding:10px 20px; background-color:#4CAF50; color:white; text-decoration:none; border-radius:5px;">Verify Email</a>
         <p>If you did not signup, ignore this email.</p>`,
});

  return {
    success: true,
    message: "Signup completed successfully",
    data: {
      userid: newUserId,
      usercode
    }
  };
};


export const sendLoginOtpService = async (data) => {
  const { email, mobile } = data;
  const [users] = await db.query(
    `SELECT id, email, mobile FROM users 
     WHERE email = ? OR mobile = ?`,
    [email || null, mobile || null]
  );

  if (!users.length) throw new Error("User not found");

  const user = users[0];
  const otp = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await db.query(
    `UPDATE users 
     SET loginotp = ?, loginotpexpires = ? 
     WHERE id = ?`,
    [otp, expiresAt, user.id]
  );

  // sendEmail(user.email, otp)
  // sendSms(user.mobile, otp)

  return {
    message: "OTP sent successfully",
  };
};


export const loginService = async (data) => {
  const { email, mobile, otp } = data;

  const [users] = await db.query(
    `SELECT * FROM users 
     WHERE email = ? OR mobile = ?`,
    [email || null, mobile || null]
  );

  if (!users.length) throw new Error("User not found");

  const user = users[0];
  if (user.loginotp !== otp) {
    throw new Error("Invalid OTP");
  }
  if (new Date(user.loginotpexpires) < new Date()) {
    throw new Error("OTP expired");
  }
  await db.query(
    `UPDATE users 
     SET loginotp = NULL, loginotpexpires = NULL 
     WHERE id = ?`,
    [user.id]
  );

  return {
    usercode: user.usercode,
    email: user.email,
    mobile: user.mobile,
    name: user.name,
  };
};

