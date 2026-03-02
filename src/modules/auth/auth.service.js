import db from "../../config/db.js";
import bcrypt from "bcrypt";
import redis from "../../config/redis.js";
import crypto from "crypto";
import generateUserCode from "../../utils/usercode.js";




export const requestSignupOtpService = async (data) => {
  const { name, email, mobile, region, address, dob,nickname, category, referralid } = data;

  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  /* -----------------------------
     1️⃣ AGE CHECK
  ----------------------------- */
  const birthDate = new Date(dob);
  const age =
    new Date(Date.now() - birthDate.getTime()).getUTCFullYear() - 1970;

  if (age < 18) {
    throw new Error("You must be at least 18 years old");
  }

  /* -----------------------------
     2️⃣ EMAIL CHECK
  ----------------------------- */
  const [[emailUser]] = await db.query(
    `SELECT id, account_status
     FROM users
     WHERE email = ?`,
    [email]
  );

  if (emailUser) {
    if (emailUser.account_status === "deleted") {
      throw new Error("This email was previously deleted. Contact support.");
    }
    throw new Error("Email already registered");
  }

  /* -----------------------------
     3️⃣ MOBILE CHECK
  ----------------------------- */
  const [[mobileUser]] = await db.query(
    `SELECT id, account_status
     FROM users
     WHERE mobile = ?`,
    [normalizedMobile]
  );

  if (mobileUser) {
    if (mobileUser.account_status === "deleted") {
      throw new Error("This mobile was previously deleted. Contact support.");
    }
    throw new Error("Mobile already registered");
  }

  /* -----------------------------
     4️⃣ GENERATE OTP
  ----------------------------- */
  const otp = crypto.randomInt(100000, 999999).toString();

  await redis.set(
    `SIGNUP:${normalizedMobile}`,
    JSON.stringify({
      name,
      email,
      nickname,
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

  return {
    success: true,
    message: "OTP sent successfully",
    otp // remove in production
  };
};



export const signupService = async ({ mobile, otp }) => {

  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  /* ================================
     1️⃣ OTP CHECK (REDIS)
  ================================= */
  const savedOtp = await redis.get(`SIGNUP_OTP:${normalizedMobile}`);
  if (!savedOtp) throw new Error("OTP expired");
  if (String(savedOtp) !== String(otp))
    throw new Error("Invalid OTP");

  /* ================================
     2️⃣ KYC CHECK
  ================================= */
  const verified = await redis.get(`KYC_VERIFIED:${normalizedMobile}`);
  if (!verified)
    throw new Error("Complete age verification first");

  /* ================================
     3️⃣ SIGNUP DATA
  ================================= */
  const signupRaw = await redis.get(`SIGNUP:${normalizedMobile}`);
  if (!signupRaw)
    throw new Error("Signup session expired");

  const signupData = JSON.parse(signupRaw);

  const {
    name, email, region, nickname,
    address, dob, category, referralid
  } = signupData;

  const categoryNormalized = String(category).toLowerCase().trim();

  /* ================================
     4️⃣ GENERATE USERCODE
  ================================= */
  let usercode;
  while (true) {
    usercode = generateUserCode();
    const [[exists]] = await db.query(
      "SELECT id FROM users WHERE usercode = ?",
      [usercode]
    );
    if (!exists) break;
  }

  /* ================================
     5️⃣ GENERATE USERID
  ================================= */
  const [[lastUser]] = await db.query(
    "SELECT userid FROM users ORDER BY id DESC LIMIT 1"
  );

  const nextNumber =
    lastUser && lastUser.userid
      ? parseInt(lastUser.userid.replace("PTW", ""), 10) + 1
      : 1;

  const userid = "PTW" + String(nextNumber).padStart(6, "0");

  /* ================================
     6️⃣ INSERT USER
  ================================= */
  const [result] = await db.query(
    `INSERT INTO users
     (userid,usercode,name,email,mobile,region,address,dob,referalid,nickname,category,emailverify,phoneverify,created_at, age_verified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, NOW(), 1)`,
    [
      userid, usercode, name, email,
      normalizedMobile, region, address || null,
      dob, referralid || null, nickname || null,
      categoryNormalized
    ]
  );

  const userId = result.insertId;

  /* ================================
     7️⃣ CREATE WALLET (JOINING BONUS = 5)
  ================================= */
  const depositLimit =
    categoryNormalized === "students" ? 300 : 1500;

  await db.query(
    `INSERT INTO wallets
     (user_id, depositwallet, earnwallet, bonusamount,
      total_deposits, total_withdrawals, deposit_limit, depositelimitdate)
     VALUES (?, 0, 0, 5, 0, 0, ?, CURDATE())`,
    [userId, depositLimit]
  );

  /* ================================
     🧾 JOINING BONUS TRANSACTION
  ================================= */
  const joiningBonus = 5;

  await db.query(
    `INSERT INTO wallet_transactions
     (user_id, wallettype, transtype, remark,
      amount, opening_balance, closing_balance)
     VALUES (?, 'bonus', 'credit',
      'Joining bonus', ?, 0, ?)`,
    [userId, joiningBonus, joiningBonus]
  );

  /* =====================================================
     🎁 REFERRAL SYSTEM — REFERRED USER GETS 3
  ===================================================== */

  if (referralid) {

    // 1️⃣ Find referrer by referral code
    const [[referrer]] = await db.query(
      "SELECT id FROM users WHERE usercode = ?",
      [referralid]
    );

    if (referrer) {

      // 2️⃣ Create referral mapping
      await db.query(
        `INSERT IGNORE INTO referral_rewards
         (referrer_id, referred_id)
         VALUES (?, ?)`,
        [referrer.id, userId]
      );

      // 3️⃣ Give signup referral bonus = 3
      const referralSignupBonus = 3;

      await db.query(
        `UPDATE wallets
         SET bonusamount = bonusamount + ?
         WHERE user_id = ?`,
        [referralSignupBonus, userId]
      );

      // 4️⃣ Wallet transaction
      await db.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark,
          amount, opening_balance, closing_balance)
         VALUES (?, 'bonus', 'credit',
          'Referral signup bonus', ?, 0, ?)`,
        [userId, referralSignupBonus, referralSignupBonus]
      );
    }
  }

  /* ================================
     CLEANUP REDIS
  ================================= */
  await redis.del(`SIGNUP:${normalizedMobile}`);
  await redis.del(`SIGNUP_OTP:${normalizedMobile}`);
  await redis.del(`KYC_VERIFIED:${normalizedMobile}`);

  return {
    success: true,
    message: "Signup completed successfully",
    data: {
      userid,
      usercode,
      joiningBonus
    }
  };
};

export const sendLoginOtpService = async ({ email, mobile }) => {
console.log(process.env.DB_HOST, process.env.DB_USER);
  /* --------------------------------
     1️⃣ FETCH USER
  -------------------------------- */
  const [users] = await db.query(
    `SELECT id,
            email,
            mobile,
            loginotp,
            loginotpexpires,
            account_status
     FROM users
     WHERE (email = ? OR mobile = ?)
     LIMIT 1`,
    [email || null, mobile || null]
  );

  if (!users.length) {
    throw new Error("User not found");
  }

  const user = users[0];

  /* --------------------------------
     2️⃣ BLOCK DELETED ACCOUNT
  -------------------------------- */
  if (user.account_status === "deleted") {
    throw new Error("This account has been deleted");
  }

  
  if (
    user.loginotp &&
    user.loginotpexpires &&
    new Date(user.loginotpexpires) > new Date()
  ) {
    return {
      success: true,
      message: "OTP already sent",
      otp: user.loginotp   // ❌ remove in production
    };
  }

  /* --------------------------------
     5️⃣ GENERATE NEW OTP
  -------------------------------- */
  const otp = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  await db.query(
    `UPDATE users
     SET loginotp = ?, loginotpexpires = ?
     WHERE id = ?`,
    [otp, expiresAt, user.id]
  );

  return {
    success: true,
    message: "OTP sent successfully",
    otp   // ❌ remove in production
  };
};




export const loginService = async ({ email, mobile, otp }, ipAddress) => {

  /* ================= FIND USER ================= */

  const [users] = await db.query(
    `SELECT id, usercode, email, mobile, name,
            loginotp, loginotpexpires, account_status
     FROM users
     WHERE (email = ? OR mobile = ?)
     LIMIT 1`,
    [email || null, mobile || null]
  );

  if (!users.length) {
    throw new Error("User not found");
  }

  const user = users[0];

  /* ================= ACCOUNT STATUS ================= */

  if (user.account_status === "deleted") {
    throw new Error("This account has been deleted");
  }

  if (user.account_status === "paused") {
    throw new Error("Your account is temporarily paused");
  }

  /* ================= OTP VALIDATION ================= */

  if (!user.loginotp) throw new Error("OTP not requested");

  if (user.loginotp !== otp) throw new Error("Invalid OTP");

  if (new Date(user.loginotpexpires) < new Date()) {
    throw new Error("OTP expired");
  }

  /* ==========================================
     ⭐ SHIFT LOGIN TIMES (BANK STYLE LOGIC)
     current_login → last_login
     NOW() → current_login
  ========================================== */

  await db.query(
    `UPDATE users
     SET loginotp = NULL,
         loginotpexpires = NULL,

         last_login = current_login,
         current_login = NOW(),

         last_login_ip = current_login_ip,
         current_login_ip = ?

     WHERE id = ?`,
    [ipAddress || null, user.id]
  );

  /* ================= RETURN USER ================= */

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


export const updateProfileService = async (userId, data) => {

  const allowedFields = [
    "name",
    "nickname",
    "region",
    "address",
    "category"
  ];

  const updateData = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (!Object.keys(updateData).length) {
    throw new Error("No valid fields to update");
  }

  await db.query(
    `UPDATE users SET ? WHERE id = ?`,
    [updateData, userId]
  );

  return {
    success: true,
    message: "Profile updated successfully"
  };
};


export const applyReferralContestBonus = async (userId) => {

  const [[ref]] = await db.query(
    `SELECT * FROM referral_rewards
     WHERE referred_id = ?`,
    [userId]
  );

  if (!ref) return;

  const reward =
    ref.first_bonus_given === 0 ? 5 : 3;

  /* 🎁 Add bonus to referrer */

  await db.query(
    `UPDATE wallets
     SET bonusamount = bonusamount + ?
     WHERE user_id = ?`,
    [reward, ref.referrer_id]
  );

  /* Update total referral earnings */

  await db.query(
    `UPDATE users
     SET referral_bonus = referral_bonus + ?
     WHERE id = ?`,
    [reward, ref.referrer_id]
  );

  /* Wallet transaction */

  await db.query(
    `INSERT INTO wallet_transactions
     (user_id, wallettype, transtype, remark,
      amount, opening_balance, closing_balance)
     VALUES (?, 'bonus', 'credit',
      'Referral contest bonus', ?, 0, ?)`,
    [ref.referrer_id, reward, reward]
  );

  /* Mark first bonus used */

  if (ref.first_bonus_given === 0) {
    await db.query(
      `UPDATE referral_rewards
       SET first_bonus_given = 1
       WHERE id = ?`,
      [ref.id]
    );
  }
};