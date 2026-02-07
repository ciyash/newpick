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
  const age =
    new Date(Date.now() - birthDate.getTime()).getUTCFullYear() - 1970;
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

  await redis.set(
    `SIGNUP:${mobile}`,
    JSON.stringify({
      name,
      email,
      mobile,
      region,
      address,
      dob,
      referralid,
      password
    }),
    { ex: 300 }
  );

  await redis.set(`SIGNUP_OTP:${mobile}`, otp, { ex: 3000 });

  console.log(`SIGNUP OTP for ${mobile}: ${otp}`);

  return {
    otp // 👈 IMPORTANT
  };
};



export const signupService = async ({ mobile, otp }) => {
  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  // 1️⃣ OTP from Redis
  const savedOtpRaw = await redis.get(`SIGNUP_OTP:${normalizedMobile}`);
  if (!savedOtpRaw) throw new Error("OTP expired");

  if (String(savedOtpRaw).trim() !== String(otp).trim()) {
    throw new Error("Invalid OTP");
  }

  // 2️⃣ Signup data from Redis
  const signupDataRaw = await redis.get(`SIGNUP:${normalizedMobile}`);
  if (!signupDataRaw) throw new Error("Signup session expired");

  const signupData =
    typeof signupDataRaw === "string"
      ? JSON.parse(signupDataRaw)
      : signupDataRaw;

  const { name, email, region, address, dob, referralid, password } = signupData;

  // 3️⃣ Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // 4️⃣ Generate unique usercode
  let usercode;
  while (true) {
    usercode = generateUserCode();
    const [[exists]] = await db.query(
      "SELECT id FROM users WHERE usercode = ?",
      [usercode]
    );
    if (!exists) break;
  }

  // 5️⃣ Generate sequential userid
  const [[lastUser]] = await db.query(
    "SELECT userid FROM users ORDER BY id DESC LIMIT 1"
  );

  let newUserId;
  if (!lastUser || !lastUser.userid) {
    newUserId = "PTW000001";
  } else {
    const lastNumber = parseInt(lastUser.userid.replace("PTW", ""), 10);
    newUserId = "PTW" + String(lastNumber + 1).padStart(6, "0");
  }

  // 6️⃣ Referral validation
  let referralUserCode = null;
  if (referralid && referralid !== "AAAAA1111") {
    const [[refUser]] = await db.query(
      "SELECT id FROM users WHERE usercode = ?",
      [referralid]
    );
    if (!refUser) throw new Error("Invalid referral code");
    referralUserCode = referralid;
  }

  // 7️⃣ Insert user
  const [userInsertResult] = await db.query(
    `INSERT INTO users
     (userid, usercode, name, email, mobile, region, address, dob,
      referalid, password, email_token, emailverify, phoneverify, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 1, NOW())`,
    [
      newUserId,
      usercode,
      name,
      email,
      normalizedMobile,
      region,
      address,
      dob,
      referralUserCode,
      hashedPassword
    ]
  );

  const userDbId = userInsertResult.insertId;

  // 8️⃣ CREATE WALLET
  await db.query(
    `INSERT INTO wallets
     (user_id, depositwallet, earnwallet, bonusamount, total_deposits, total_withdrawals)
     VALUES (?, 0, 0, 0, 0, 0)`,
    [userDbId]
  );

  // 🎁 9️⃣ JOINING BONUS (5 pounds)
  await db.query(
    `UPDATE wallets
     SET bonusamount = bonusamount + 5
     WHERE user_id = ?`,
    [userDbId]
  );

  // 🔟 Clear Redis
  await redis.del(`SIGNUP:${normalizedMobile}`);
  await redis.del(`SIGNUP_OTP:${normalizedMobile}`);

  // 11️⃣ Return response
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
    `SELECT id, email, mobile, loginotp, loginotpexpires
     FROM users 
     WHERE email = ? OR mobile = ?`,
    [email || null, mobile || null]
  );

  if (!users.length) throw new Error("User not found");

  const user = users[0];

  // 🛑 If OTP already exists & not expired
  if (
    user.loginotp &&
    user.loginotpexpires &&
    new Date(user.loginotpexpires) > new Date()
  ) {
    console.log(
      `LOGIN OTP (REUSED) for ${user.email || user.mobile}: ${user.loginotp}`
    );

    return {
      message: "OTP already sent",
      otp: user.loginotp // reuse same OTP
    };
  }

  // Generate new OTP
  const otp = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.query(
    `UPDATE users 
     SET loginotp = ?, loginotpexpires = ? 
     WHERE id = ?`,
    [otp, expiresAt, user.id]
  );

  console.log(`LOGIN OTP (NEW) for ${user.email || user.mobile}: ${otp}`);

  return {
    message: "OTP sent successfully",
    otp
  };
};


export const loginService = async (data) => {
  const { email, mobile, otp } = data;

  const [users] = await db.query(
    `SELECT id, usercode, email, mobile, name, loginotp, loginotpexpires
     FROM users
     WHERE email = ? OR mobile = ?`,
    [email || null, mobile || null]
  );

  if (!users.length) {
    throw new Error("User not found");
  }

  const user = users[0];

  // OTP validation
  if (user.loginotp !== otp) {
    throw new Error("Invalid OTP");
  }

  if (new Date(user.loginotpexpires) < new Date()) {
    throw new Error("OTP expired");
  }

  // Clear OTP after successful login
  await db.query(
    `UPDATE users
     SET loginotp = NULL, loginotpexpires = NULL
     WHERE id = ?`,
    [user.id]
  );

  // 🔑 IMPORTANT: id must be returned
  return {
    id: user.id,              // ✅ REQUIRED for JWT & wallet
    usercode: user.usercode,
    email: user.email,
    mobile: user.mobile,
    name: user.name,
  };
};
