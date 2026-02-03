
import bcrypt from "bcrypt";
import db from "../../config/db.js";
import redisClient from "../../config/redis.js";
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

export const signupService = async (data) => {
  const { name, email, mobile, region, address, dob, referralid, password } = data;
  const birthDate = new Date(dob);
  const ageDifMs = Date.now() - birthDate.getTime();
  const ageDate = new Date(ageDifMs);
  const age = Math.abs(ageDate.getUTCFullYear() - 1970);
  if (age < 18) throw new Error("You must be at least 18 years old");

  const [existingEmail] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  if (existingEmail.length) throw new Error("Email already registered");

  const [existingMobile] = await db.query("SELECT * FROM users WHERE mobile = ?", [mobile]);
  if (existingMobile.length) throw new Error("Mobile already registered");

  const hashedPassword = await bcrypt.hash(password, 10);
  let usercode;
  let isUnique = false;

  while (!isUnique) {
    usercode = generateUserCode();
    const [existing] = await db.query("SELECT usercode FROM users WHERE usercode = ?", [usercode]);
    if (existing.length === 0) isUnique = true;
  }
  let referralUserId = null;
  if (referralid) {
    const [refUser] = await db.query("SELECT usercode FROM users WHERE usercode = ?", [referralid]);
    if (refUser.length === 0) throw new Error("Invalid referral code");
    referralUserId = referralid;
  }

  const emailToken = crypto.randomBytes(20).toString("hex");
  const mobileOtp = Math.floor(100000 + Math.random() * 900000);
  await redisClient.setEx(`OTP:${mobile}`, 300, mobileOtp.toString());
  await db.query(
    `INSERT INTO users
      (usercode, name, email, mobile, region, address, dob, referalid, password, email_token, emailverify, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [usercode, name, email, mobile, region, address, dob, referralUserId, hashedPassword, emailToken, 0]
  );

  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${emailToken}`;
  // await transporter.sendMail({
  //   from: process.env.SMTP_USER,
  //   to: email,
  //   subject: "Verify your email",
  //   html: `<p>Hi ${name},</p>
  //          <p>Click the link below to verify your email:</p>
  //          <a href="${verificationUrl}">${verificationUrl}</a>
  //          <p>Thank you!</p>`,
  // });

  return {
    success: true,
    message: "Signup successful! OTP sent to mobile, email verification sent.",
    data: {
      usercode,
      mobileOtp, 
    },
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

