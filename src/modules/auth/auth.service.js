import db from "../../config/db.js";
import bcrypt from "bcrypt";
import redis from "../../config/redis.js";
import crypto from "crypto";
import generateUserCode from "../../utils/usercode.js";

/* ================= PAUSE PLANS ================= */

const PAUSE_PLANS = {
  "1d":  1,
  "7d":  7,
  "30d": 30,
};

/* ================= HELPER — GET LAST BALANCE ================= */

const getLastBalance = async (conn, userId) => {

  // User last closing balance
  const [[userLast]] = await conn.query(
    `SELECT userclosingbalance
     FROM wallet_transactions
     WHERE user_id = ?
     AND user_id != 0
     ORDER BY id DESC
     LIMIT 1 FOR UPDATE`,
    [userId]
  );

  // Company last closing balance
  const [[companyLast]] = await conn.query(
    `SELECT closing_balance
     FROM wallet_transactions
     WHERE user_id = 0
     ORDER BY id DESC
     LIMIT 1 FOR UPDATE`
  );

  return {
    userOpening:    Number(userLast?.userclosingbalance || 0),
    companyOpening: Number(companyLast?.closing_balance || 0)
  };
};

/* ================= REQUEST SIGNUP OTP ================= */

export const requestSignupOtpService = async (data) => {
  const { name, email, mobile, region, address, dob, nickname, category, referralid } = data;

  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  /* ─── 1 Age Check ─── */
  const birthDate = new Date(dob);
  const age       = new Date(Date.now() - birthDate.getTime()).getUTCFullYear() - 1970;
  if (age < 18) throw new Error("You must be at least 18 years old");

  /* ─── 2 Email & Mobile Check — parallel for speed ─── */
  const [
    [[emailUser]],
    [[mobileUser]]
  ] = await Promise.all([
    db.query(`SELECT id, account_status FROM users WHERE email = ?`,  [email]),
    db.query(`SELECT id, account_status FROM users WHERE mobile = ?`, [normalizedMobile])
  ]);

  if (emailUser) {
    throw new Error(
      emailUser.account_status === "deleted"
        ? "This email was previously deleted. Contact support."
        : "Email already registered"
    );
  }

  if (mobileUser) {
    throw new Error(
      mobileUser.account_status === "deleted"
        ? "This mobile was previously deleted. Contact support."
        : "Mobile already registered"
    );
  }

  /* ─── 3 Generate & Store OTP — parallel for speed ─── */
  const otp = crypto.randomInt(100000, 999999).toString();

  await Promise.all([
    redis.set(
      `SIGNUP:${normalizedMobile}`,
      JSON.stringify({
        name, email, nickname,
        mobile: normalizedMobile,
        region, address, dob, category,
        referralid: referralid || "AAAAA1111"
      }),
      { ex: 300 }
    ),
    redis.set(`SIGNUP_OTP:${normalizedMobile}`, otp, { ex: 300 })
  ]);


  return {
    success: true,
    message: "OTP sent successfully",
    ...(process.env.NODE_ENV !== "production" && { otp })
  };
};

/* ================= VERIFY SIGNUP OTP ================= */

export const signupService = async ({ mobile, otp }) => {

  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  /* ─── 1 OTP Check ─── */
  const savedOtp = await redis.get(`SIGNUP_OTP:${normalizedMobile}`);
  if (!savedOtp)                        throw new Error("OTP expired");
  if (String(savedOtp) !== String(otp)) throw new Error("Invalid OTP");

  /* ─── 2 Get Signup Session ─── */
  const signupRaw = await redis.get(`SIGNUP:${normalizedMobile}`);
  if (!signupRaw) throw new Error("Signup session expired");

  let signupData;
  try {
    signupData = typeof signupRaw === "string" ? JSON.parse(signupRaw) : signupRaw;
  } catch {
    throw new Error("Invalid signup session data");
  }

  const { name, email, region, nickname, address, dob, category, referralid } = signupData;
  const categoryNormalized = String(category).toLowerCase().trim();

  /* ─── 3 Transaction — all or nothing ─── */
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    /* ─── 4 Generate Unique Usercode ─── */
    let usercode;
    while (true) {
      usercode = generateUserCode();
      const [[exists]] = await conn.query(
        "SELECT id FROM users WHERE usercode = ?", [usercode]
      );
      if (!exists) break;
    }
    /* ─── 5 Generate Userid — FOR UPDATE prevents race condition ─── */
    const [[lastUser]] = await conn.query(
      "SELECT userid FROM users ORDER BY id DESC LIMIT 1 FOR UPDATE"
    );
    const nextNumber = lastUser?.userid
      ? parseInt(lastUser.userid.replace("PTW", ""), 10) + 1
      : 1;
    const userid = "PTW" + String(nextNumber).padStart(6, "0");

    /* ─── 6 Insert User ─── */
    const [result] = await conn.query(
      `INSERT INTO users
       (userid, usercode, name, email, mobile, region, address,
        dob, referalid, nickname, category, emailverify, phoneverify,
        created_at, age_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, NOW(), 1)`,
      [
        userid, usercode, name, email,
        normalizedMobile, region, address || null,
        dob, referralid || null, nickname || null,
        categoryNormalized
      ]
    );
    const userId = result.insertId;

    /* ─── 7 Create Wallet ─── */
    const depositLimit = categoryNormalized === "students" ? 300 : 1500;
    const joiningBonus = 5;

    await conn.query(
      `INSERT INTO wallets
       (user_id, depositwallet, earnwallet, bonusamount,
        total_deposits, total_withdrawals, deposit_limit, depositelimitdate)
       VALUES (?, 0, 0, ?, 0, 0, ?, CURDATE())`,
      [userId, joiningBonus, depositLimit]
    );

    /* ─── 8 Joining Bonus Transaction ─── */
  
    const { userOpening: joinUserOpening, companyOpening: joinCompanyOpening }
      = await getLastBalance(conn, userId);

    const joinUserClosing    = joinUserOpening    + joiningBonus;  // credit → plus
    const joinCompanyClosing = joinCompanyOpening - joiningBonus;  // expense → minus

    await conn.query(
      `INSERT INTO wallet_transactions
       (user_id, wallettype, transtype, remark,
        amount,
        useropeningbalance, userclosingbalance,
        opening_balance,    closing_balance)
       VALUES (?, 'bonus', 'credit', 'Joining bonus',
        ?,
        ?, ?,
        ?, ?)`,
      [
        userId,
        joiningBonus,
        joinUserOpening,    joinUserClosing,      // user side
        joinCompanyOpening, joinCompanyClosing     // company side
      ]
    );

    /* ─── 9 Referral System ─── */
    if (referralid) {
      const [[referrer]] = await conn.query(
        "SELECT id FROM users WHERE usercode = ?", [referralid]
      );

      if (referrer) {

        // Create referral mapping
        await conn.query(
          `INSERT IGNORE INTO referral_rewards (referrer_id, referred_id) VALUES (?, ?)`,
          [referrer.id, userId]
        );

        const referralSignupBonus = 3;

        // Update referred user wallet
        await conn.query(
          `UPDATE wallets SET bonusamount = bonusamount + ? WHERE user_id = ?`,
          [referralSignupBonus, userId]
        );

      
        const { userOpening: refUserOpening, companyOpening: refCompanyOpening }
          = await getLastBalance(conn, userId);

        const refUserClosing    = refUserOpening    + referralSignupBonus;  // credit → plus
        const refCompanyClosing = refCompanyOpening - referralSignupBonus;  // expense → minus

        await conn.query(
          `INSERT INTO wallet_transactions
           (user_id, wallettype, transtype, remark,
            amount,
            useropeningbalance, userclosingbalance,
            opening_balance,    closing_balance)
           VALUES (?, 'bonus', 'credit', 'Referral signup bonus',
            ?,
            ?, ?,
            ?, ?)`,
          [
            userId,
            referralSignupBonus,
            refUserOpening,    refUserClosing,       // user side
            refCompanyOpening, refCompanyClosing      // company side
          ]
        );
      }
    }

    await conn.commit();

    /* ─── Cleanup Redis — parallel for speed ─── */
    await Promise.all([
      redis.del(`SIGNUP:${normalizedMobile}`),
      redis.del(`SIGNUP_OTP:${normalizedMobile}`),
      redis.del(`KYC_VERIFIED:${normalizedMobile}`)
    ]);

    return {
      success: true,
      message: "Signup completed successfully",
      data: { userid, usercode, joiningBonus }
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ================= SEND LOGIN OTP ================= */

export const sendLoginOtpService = async ({ email, mobile }) => {



  /* ─── 1 Fetch User ─── */
  const [users] = await db.query(
    `SELECT id, email, mobile, loginotp, loginotpexpires, account_status
     FROM users
     WHERE (email = ? OR mobile = ?)
     LIMIT 1`,
    [email || null, mobile || null]
  );

  if (!users.length) throw new Error("User not found");
  const user = users[0];

  /* ─── 2 Block Deleted Account ─── */
  if (user.account_status === "deleted") {
    throw new Error("This account has been deleted");
  }

  /* ─── 3 Reuse Existing OTP if Still Valid ─── */
  if (
    user.loginotp        &&
    user.loginotpexpires &&
    new Date(user.loginotpexpires) > new Date()
  ) {
    return {
      success: true,
      message: "OTP already sent",
      ...(process.env.NODE_ENV !== "production" && { otp: user.loginotp })
    };
  }

  /* ─── 4 Generate New OTP ─── */
  const otp       = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);  // 5 mins

  const [updateResult] = await db.query(
    `UPDATE users SET loginotp = ?, loginotpexpires = ? WHERE id = ?`,
    [otp, expiresAt, user.id]
  );

  if (updateResult.affectedRows === 0) throw new Error("Failed to generate OTP");


  return {
    success: true,
    message: "OTP sent successfully",
    ...(process.env.NODE_ENV !== "production" && { otp })
  };
};

/* ================= LOGIN ================= */

export const loginService = async ({ email, mobile, otp }, ipAddress) => {

  /* ─── Find User ─── */
  const [users] = await db.query(
    `SELECT id, usercode, email, mobile, name,
            loginotp, loginotpexpires, account_status
     FROM users
     WHERE (email = ? OR mobile = ?)
     LIMIT 1`,
    [email || null, mobile || null]
  );

  if (!users.length) throw new Error("User not found");
  const user = users[0];

  /* ─── Account Status ─── */
  if (user.account_status === "deleted") throw new Error("This account has been deleted");
  if (user.account_status === "paused")  throw new Error("Your account is temporarily paused");

  /* ─── OTP Validation ─── */
  if (!user.loginotp)                              throw new Error("OTP not requested");
  if (user.loginotp !== otp)                       throw new Error("Invalid OTP");
  if (new Date(user.loginotpexpires) < new Date()) throw new Error("OTP expired");

  /* ─── Shift Login Times (Bank Style) ─── */
  const [result] = await db.query(
    `UPDATE users
     SET loginotp         = NULL,
         loginotpexpires  = NULL,
         last_login       = current_login,
         current_login    = NOW(),
         last_login_ip    = current_login_ip,
         current_login_ip = ?
     WHERE id = ?`,
    [ipAddress || null, user.id]
  );

  if (result.affectedRows === 0) throw new Error("Login state update failed");

  /* ─── Return User ─── */
  return {
    id:       user.id,
    usercode: user.usercode,
    email:    user.email,
    mobile:   user.mobile,
    name:     user.name
  };
};

/* ================= PAUSE ACCOUNT ================= */

export const pauseAccountService = async (userId, durationKey) => {

  const days = PAUSE_PLANS[durationKey];
  if (!days) throw new Error("Invalid pause duration");

  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);

  const [result] = await db.query(
    `UPDATE users SET
      account_status = 'paused',
      pause_start    = ?,
      pause_end      = ?
     WHERE id = ?`,
    [now, end, userId]
  );

  if (result.affectedRows === 0) throw new Error("Failed to pause account");

  return { status: "paused", pauseTill: end };
};

/* ================= ADMIN LOGIN ================= */

const MAX_FAILED_ATTEMPTS = 5;

export const adminLoginService = async ({ email, password }, ipAddress) => {

  const [rows] = await db.query(
    "SELECT * FROM admin WHERE email = ?", [email]
  );
  const admin = rows[0];

  /* ─── Admin Not Found ─── */
  if (!admin) {
    await db.query(
      `INSERT INTO admin_logs (email, action, reason, ip_address)
       VALUES (?, 'LOGIN_FAILED', 'EMAIL_NOT_FOUND', ?)`,
      [email, ipAddress]
    );
    throw new Error("Invalid credentials");
  }

  /* ─── Inactive Account ─── */
  if (admin.status !== "active") {
    await db.query(
      `INSERT INTO admin_logs (admin_id, email, action, reason, ip_address)
       VALUES (?, ?, 'LOGIN_FAILED', 'ACCOUNT_INACTIVE', ?)`,
      [admin.id, admin.email, ipAddress]
    );
    throw new Error("Account is inactive");
  }

  /* ─── Password Check ─── */
  const isMatch = await bcrypt.compare(password, admin.password_hash);

  if (!isMatch) {

    const newFailedAttempts = admin.failed_attempts + 1;

    await db.query(
      `UPDATE admin
       SET failed_attempts = ?
       ${newFailedAttempts >= MAX_FAILED_ATTEMPTS ? ", status = 'inactive'" : ""}
       WHERE id = ?`,
      [newFailedAttempts, admin.id]
    );

    await db.query(
      `INSERT INTO admin_logs (admin_id, email, action, reason, ip_address)
       VALUES (?, ?, 'LOGIN_FAILED', 'INVALID_PASSWORD', ?)`,
      [admin.id, admin.email, ipAddress]
    );

    throw new Error("Invalid credentials");
  }

  /* ─── Success ─── */
  await db.query(
    `UPDATE admin SET failed_attempts = 0, last_login = NOW() WHERE id = ?`,
    [admin.id]
  );

  await db.query(
    `INSERT INTO admin_logs (admin_id, email, action, ip_address)
     VALUES (?, ?, 'LOGIN_SUCCESS', ?)`,
    [admin.id, admin.email, ipAddress]
  );

  const { password_hash, ...safeAdmin } = admin;
  return safeAdmin;
};

/* ================= UPDATE PROFILE ================= */

export const updateProfileService = async (userId, data) => {

  const ALLOWED_FIELDS = ["name", "nickname", "region", "address", "category"];

  const sanitized = {};
  for (const key of ALLOWED_FIELDS) {
    if (data[key] !== undefined && data[key] !== "") {
      sanitized[key] = data[key];
    }
  }

  if (!Object.keys(sanitized).length) throw new Error("No valid fields to update");

  const setClauses = Object.keys(sanitized).map(k => `${k} = ?`).join(", ");
  const values     = [...Object.values(sanitized), userId];

  const [result] = await db.query(
    `UPDATE users SET ${setClauses} WHERE id = ?`, values
  );

  if (result.changedRows === 0) {
    return { success: true, message: "No changes were made — values are identical" };
  }

  return { success: true, message: "Profile updated successfully" };
};

/* ================= REFERRAL CONTEST BONUS ================= */

export const applyReferralContestBonus = async (userId) => {

  const [[ref]] = await db.query(
    `SELECT * FROM referral_rewards WHERE referred_id = ?`, [userId]
  );

  if (!ref) return;

  const reward = ref.first_bonus_given === 0 ? 5 : 3;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    /* ─── Add Bonus to Referrer Wallet ─── */
    await conn.query(
      `UPDATE wallets SET bonusamount = bonusamount + ? WHERE user_id = ?`,
      [reward, ref.referrer_id]
    );

    /* ─── Update Referral Earnings ─── */
    await conn.query(
      `UPDATE users SET referral_bonus = referral_bonus + ? WHERE id = ?`,
      [reward, ref.referrer_id]
    );

    /* ─── Referrer Wallet Transaction ─── */
    const { userOpening, companyOpening } = await getLastBalance(conn, ref.referrer_id);

    const userClosing    = userOpening    + reward;  // credit → plus
    const companyClosing = companyOpening - reward;  // expense → minus

    await conn.query(
      `INSERT INTO wallet_transactions
       (user_id, wallettype, transtype, remark,
        amount,
        useropeningbalance, userclosingbalance,
        opening_balance,    closing_balance)
       VALUES (?, 'bonus', 'credit', 'Referral contest bonus',
        ?,
        ?, ?,
        ?, ?)`,
      [
        ref.referrer_id,
        reward,
        userOpening,    userClosing,      // user side
        companyOpening, companyClosing    // company side
      ]
    );

    /* ─── Mark First Bonus Used ─── */
    if (ref.first_bonus_given === 0) {
      await conn.query(
        `UPDATE referral_rewards SET first_bonus_given = 1 WHERE id = ?`,
        [ref.id]
      );
    }

    await conn.commit();

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};