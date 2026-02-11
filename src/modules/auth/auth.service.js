import db from "../../config/db.js";
import bcrypt from "bcrypt";
import redis from "../../config/redis.js";
import crypto from "crypto";
import generateUserCode from "../../utils/usercode.js";


export const requestSignupOtpService = async (data) => {
  const { name, email, mobile, region, address, dob,category, referralid } = data;

  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  // age check
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
    [normalizedMobile]
  );
  if (mobileExists) throw new Error("Mobile already registered");

  const otp = crypto.randomInt(100000, 999999).toString();

  // 🔑 ALWAYS USE normalizedMobile
  await redis.set(
    `SIGNUP:${normalizedMobile}`,
    JSON.stringify({
      name,
      email,
      mobile: normalizedMobile,
      region,
      address,
      dob,
      category,
      referralid: referralid || "AAAAA1111"
    }),
    { ex: 300 }
  );

  await redis.set(
    `SIGNUP_OTP:${normalizedMobile}`,
    otp,
    { ex: 300 }
  );

  console.log(`SIGNUP OTP for ${normalizedMobile}: ${otp}`);

  return {
    success: true,
    message: "OTP sent to mobile number",
    otp
  };
};



export const signupService = async ({ mobile, otp }) => {
  // ✅ Normalize mobile EXACTLY same as signup OTP service
  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  /* --------------------------------
     1️⃣ OTP CHECK
  -------------------------------- */
  const savedOtp = await redis.get(`SIGNUP_OTP:${normalizedMobile}`);
  if (!savedOtp) {
    throw new Error("OTP expired");
  }

  if (String(savedOtp).trim() !== String(otp).trim()) {
    throw new Error("Invalid OTP");
  }

  /* --------------------------------
     2️⃣ SIGNUP DATA FROM REDIS
  -------------------------------- */
  const signupRaw = await redis.get(`SIGNUP:${normalizedMobile}`);
  if (!signupRaw) {
    throw new Error("Signup session expired");
  }

 const signupData =
  typeof signupRaw === "string"
    ? JSON.parse(signupRaw)
    : signupRaw;

  const { name, email, region, address, dob,category, referralid } = signupData;


  let usercode;
  while (true) {
    usercode = generateUserCode();
    const [[exists]] = await db.query(
      "SELECT id FROM users WHERE usercode = ?",
      [usercode]
    );
    if (!exists) break;
  }

  /* --------------------------------
     4️⃣ GENERATE SEQUENTIAL USERID
  -------------------------------- */
  const [[lastUser]] = await db.query(
    "SELECT userid FROM users ORDER BY id DESC LIMIT 1"
  );

  const nextNumber = lastUser && lastUser.userid
    ? parseInt(lastUser.userid.replace("PTW", ""), 10) + 1
    : 1;

  const userid = "PTW" + String(nextNumber).padStart(6, "0");

  /* --------------------------------
     5️⃣ REFERRAL VALIDATION
  -------------------------------- */
  let referralUserCode = null;

  if (referralid && referralid !== "AAAAA1111") {
    const [[refUser]] = await db.query(
      "SELECT id FROM users WHERE usercode = ?",
      [referralid]
    );

    if (!refUser) {
      throw new Error("Invalid referral code");
    }

    referralUserCode = referralid;
  }

  /* --------------------------------
     6️⃣ INSERT USER
  -------------------------------- */
 const [result] = await db.query(
  `INSERT INTO users
   (
     userid,
     usercode,
     name,
     email,
     mobile,
     region,
     address,
     dob,
     referalid,
     category,
     emailverify,
     phoneverify,
     created_at
   )
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, NOW())`,
  [
    userid,
    usercode,
    name,
    email,
    normalizedMobile,
    region,
    address || null,
    dob,
    referralUserCode,
    category   // ✅ CORRECT PLACE
  ]
);

  const userId = result.insertId;

  /* --------------------------------
     7️⃣ CREATE WALLET
  -------------------------------- */
  await db.query(
    `INSERT INTO wallets
     (user_id, depositwallet, earnwallet, bonusamount, total_deposits, total_withdrawals)
     VALUES (?, 0, 0, 0, 0, 0)`,
    [userId]
  );

  /* --------------------------------
     8️⃣ JOINING BONUS
  -------------------------------- */
  await db.query(
    `UPDATE wallets
     SET bonusamount = bonusamount + 5
     WHERE user_id = ?`,
    [userId]
  );

  /* --------------------------------
     9️⃣ CLEAR REDIS
  -------------------------------- */
  await redis.del(`SIGNUP:${normalizedMobile}`);
  await redis.del(`SIGNUP_OTP:${normalizedMobile}`);
  
 //const verificationUrl = `${process.env.FRONTEND_URL}/email-verified?token=${emailToken}`;

// await transporter.sendMail({
//   from: process.env.SMTP_USER,
//   to: email,
//   subject: "Verify your email",
//   html: `<p>Hi ${name},</p>
//          <p>Click the button below to verify your email:</p>
//          <a href="${verificationUrl}" style="padding:10px 20px; background-color:#4CAF50; color:white; text-decoration:none; border-radius:5px;">Verify Email</a>
//          <p>If you did not signup, ignore this email.</p>`,
// });

  /* --------------------------------
     🔟 RESPONSE
  -------------------------------- */
  return {
    success: true,
    message: "Signup completed successfully",
    data: {
      userid,
      usercode
    }
  };
};


export const sendLoginOtpService = async ({ email, mobile }) => {
  const [users] = await db.query(
    `SELECT id, email, mobile, loginotp, loginotpexpires
     FROM users
     WHERE email = ? OR mobile = ?`,
    [email || null, mobile || null]
  );

  if (!users.length) throw new Error("User not found");

  const user = users[0];

  // 🔁 Reuse OTP if not expired
  if (
    user.loginotp &&
    user.loginotpexpires &&
    new Date(user.loginotpexpires) > new Date()
  ) {
    console.log(`LOGIN OTP (REUSED): ${user.loginotp}`);
    return {
      otp: user.loginotp
    };
  }

  // 🔐 Generate new OTP
  const otp = crypto.randomInt(100000, 999999).toString();
   console.log("Send OTP :",otp);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.query(
    `UPDATE users
     SET loginotp = ?, loginotpexpires = ?
     WHERE id = ?`,
    [otp, expiresAt, user.id]
  );

  console.log(`LOGIN OTP (NEW): ${otp}`);

  return {
    otp
  };
};




export const loginService = async ({ email, mobile, otp }) => {
  const [users] = await db.query(
    `SELECT id, usercode, email, mobile, name, loginotp, loginotpexpires
     FROM users
     WHERE email = ? OR mobile = ?`,
    [email || null, mobile || null]
  );

  if (!users.length) throw new Error("User not found");

  const user = users[0];

  if (user.loginotp !== otp) throw new Error("Invalid OTP");
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
    id: user.id,
    usercode: user.usercode,
    email: user.email,
    mobile: user.mobile,
    name: user.name
  };
};


export const pauseAccountService = async (userId, durationKey) => {
  const days = PAUSE_PLANS[durationKey];
  if (!days) throw new Error("Invalid pause duration");

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);

  await db.query(
    `UPDATE users SET
      account_status = 'paused',
      pause_start = ?,
      pause_end = ?
     WHERE id = ?`,
    [now, end, userId]
  );

  return {
    status: "paused",
    pauseTill: end
  };
};


//Admin service
const MAX_FAILED_ATTEMPTS = 5;

export const adminLoginService = async ({ email, password }, ipAddress) => {

  const [rows] = await db.query(
    'SELECT * FROM admin WHERE email = ?',
    [email]
  );

  const admin = rows[0];

  if (!admin) {
    await db.query(
      `INSERT INTO admin_logs (email, action, reason, ip_address)
       VALUES (?, 'LOGIN_FAILED', 'EMAIL_NOT_FOUND', ?)`,
      [email, ipAddress]
    );
    throw new Error("Invalid credentials");
  }

  
  if (admin.status !== 'active') {
    await db.query(
      `INSERT INTO admin_logs (admin_id, email, action, reason, ip_address)
       VALUES (?, ?, 'LOGIN_FAILED', 'ACCOUNT_INACTIVE', ?)`,
      [admin.id, admin.email, ipAddress]
    );
    throw new Error("Account is inactive");
  }

  const isMatch = await bcrypt.compare(password, admin.password_hash);

  if (!isMatch) {
    await db.query(
      `UPDATE admin
       SET failed_attempts = failed_attempts + 1
       WHERE id = ?`,
      [admin.id]
    );

    await db.query(
      `INSERT INTO admin_logs (admin_id, email, action, reason, ip_address)
       VALUES (?, ?, 'LOGIN_FAILED', 'INVALID_PASSWORD', ?)`,
      [admin.id, admin.email, ipAddress]
    );

    if (admin.failed_attempts + 1 >= MAX_FAILED_ATTEMPTS) {
      await db.query(
        `UPDATE admin SET status = 'inactive' WHERE id = ?`,
        [admin.id]
      );
    }

    throw new Error("Invalid credentials");
  }

  await db.query(
    `UPDATE admin
     SET failed_attempts = 0, last_login = NOW()
     WHERE id = ?`,
    [admin.id]
  );

  await db.query(
    `INSERT INTO admin_logs (admin_id, email, action, ip_address)
     VALUES (?, ?, 'LOGIN_SUCCESS', ?)`,
    [admin.id, admin.email, ipAddress]
  );

  delete admin.password_hash;
  return admin;
};
