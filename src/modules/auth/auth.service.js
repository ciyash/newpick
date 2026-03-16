import db from "../../config/db.js";
import bcrypt from "bcrypt";
import redis from "../../config/redis.js";
import crypto from "crypto";
import generateUserCode from "../../utils/usercode.js";
import { sendVerificationEmail } from "../../utils/sendVerificationEmail.js";
import { sendOtpEmail } from '../../utils/send.otp.mails.js';

    
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

const JOINING_BONUS          = 5;
const REFERRAL_SIGNUP_BONUS  = 3;
const MAX_USERCODE_RETRIES   = 10;

export const signupService = async ({ mobile, otp }) => {

  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  /* ─── 1️⃣ OTP Check ─── */
  const savedOtp = await redis.get(`SIGNUP_OTP:${normalizedMobile}`);
  if (!savedOtp) throw new Error("OTP expired");
  if (String(savedOtp) !== String(otp)) throw new Error("Invalid OTP");

  /* ─── 2️⃣ Get & Validate Signup Session ─── */
  const signupRaw = await redis.get(`SIGNUP:${normalizedMobile}`);
  if (!signupRaw) throw new Error("Signup session expired");

  let signupData;
  try {
    signupData =
      typeof signupRaw === "string" ? JSON.parse(signupRaw) : signupRaw;
  } catch {
    throw new Error("Invalid signup session data");
  }

  // ✅ Sanitize all fields from Redis before using in DB
  const name       = String(signupData.name      || "").trim().slice(0, 100);
  const email      = String(signupData.email      || "").trim().toLowerCase().slice(0, 200);
  const region     = String(signupData.region     || "").trim().slice(0, 100);
  const nickname   = signupData.nickname  ? String(signupData.nickname).trim().slice(0, 50)  : null;
  const address    = signupData.address   ? String(signupData.address).trim().slice(0, 300)  : null;
  const dob        = signupData.dob       ? String(signupData.dob).trim()                    : null;
  const referralid = signupData.referralid ? String(signupData.referralid).trim().slice(0, 20) : null;
  const categoryNormalized = String(signupData.category || "").toLowerCase().trim();

  if (!name)  throw new Error("Invalid signup session: missing name");
  if (!email) throw new Error("Invalid signup session: missing email");

  /* ─── 3️⃣ Transaction — all or nothing ─── */
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    /* ─── 4️⃣ Acquire Named Lock — prevents race on company balance ─── */
    const [[lockResult]] = await conn.query(
      `SELECT GET_LOCK('company_balance_lock', 10) AS locked`
    );
    if (!lockResult?.locked) throw new Error("Server busy, please try again");

    /* ─── 5️⃣ Generate Unique Usercode — with retry limit ─── */
    let usercode;
    let retries = 0;

    while (true) {
      if (retries >= MAX_USERCODE_RETRIES) {
        throw new Error("Failed to generate unique usercode, please try again");
      }
      usercode = generateUserCode();  

      const [[exists]] = await conn.query(
        "SELECT id FROM users WHERE usercode = ?",
        [usercode]
      );

      if (!exists) break;
      retries++;
    }

    /* ─── 6️⃣ Generate Userid ─── */
    const [[lastUser]] = await conn.query(
      "SELECT userid FROM users ORDER BY id DESC LIMIT 1 FOR UPDATE"
    );

    const nextNumber = lastUser?.userid
      ? parseInt(lastUser.userid.replace("PTW", ""), 10) + 1
      : 1;

    const userid = "PTW" + String(nextNumber).padStart(6, "0");

    /* ─── 7️⃣ Insert User ─── */
    const [result] = await conn.query(
      `INSERT INTO users
       (userid, usercode, name, email, mobile, region, address,
        dob, referralid, nickname, category,
        email_verify, mobile_verify,
        created_at, age_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, NOW(), 1)`,
      [
        userid, usercode, name, email,
        normalizedMobile, region, address,
        dob, referralid, nickname,
        categoryNormalized,
      ]
    );

    const userId = result.insertId;

    /* ─── Create Wallet ─── */

    const depositLimit =
      categoryNormalized === "students" ? 300 : 1500;

    const joiningBonus = 5;
  
    await conn.query(
      `INSERT INTO wallets
       (user_id, depositwallet, earnwallet, bonusamount,
        total_deposits, total_withdrawals, deposit_limit,monthly_limit, depositelimitdate)
       VALUES (?, 0, 0, 0, 0, 0, ?,?, CURDATE())`,
      [userId, depositLimit,depositLimit]
    );
    // ✅ Wallet starts at 0,0,0 — bonus credited via transaction below
    //    so opening/closing balances are accurate from the first transaction

    /* ─── 9️⃣ Get Company Last Balance ONCE — FOR UPDATE prevents stale read ─── */
    const [[companyLast]] = await conn.query(
      `SELECT closing_balance
       FROM wallet_transactions
       WHERE closing_balance != 0
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`
    );
    let companyBalance = Number(companyLast?.closing_balance || 0);

    // ✅ userBalance starts at 0 — new user, no funds yet
    //    runs as sequential total across all transaction rows
    //    consistent with buySubscriptionService pattern
    let userBalance = 0;

    /* ─── 🔟 Joining Bonus Transaction ─── */
    {
      const uOpen   = userBalance;
      const uClose  = Number((userBalance    + JOINING_BONUS).toFixed(2));  // user receives ↑
      userBalance   = uClose;

      const coOpen  = companyBalance;
      const coClose = Number((companyBalance - JOINING_BONUS).toFixed(2));  // company gives ↓
      companyBalance = coClose;

      // ✅ Credit wallet and insert transaction together
      await conn.query(
        `UPDATE wallets SET bonusamount = bonusamount + ? WHERE user_id = ?`,
        [JOINING_BONUS, userId]
      );

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
          JOINING_BONUS,
          uOpen,  uClose,       // user:    0 → 5
          coOpen, coClose,      // company: X → X-5
        ]
      );
    }

    /* ─── 1️⃣1️⃣ Referral System ─── */
    if (referralid) {

      const [[referrer]] = await conn.query(
        "SELECT id FROM users WHERE usercode = ? FOR UPDATE", [referralid]
      );

      if (referrer) {

        await conn.query(
          `INSERT IGNORE INTO referral_rewards
           (referrer_id, referred_id)
           VALUES (?, ?)`,
          [referrer.id, userId]
        );

        // ✅ userBalance continues from where joining bonus left off (5)
        //    NO separate getLastBalance call — avoids stale/wrong read
        const uOpen   = userBalance;
        const uClose  = Number((userBalance    + REFERRAL_SIGNUP_BONUS).toFixed(2));  // user receives ↑
        userBalance   = uClose;

        const coOpen  = companyBalance;
        const coClose = Number((companyBalance - REFERRAL_SIGNUP_BONUS).toFixed(2));  // company gives ↓
        companyBalance = coClose;

        // ✅ Wallet update and transaction insert together
        await conn.query(
          `UPDATE wallets SET bonusamount = bonusamount + ? WHERE user_id = ?`,
          [REFERRAL_SIGNUP_BONUS, userId]
        );

        await conn.query(
          `INSERT INTO wallet_transactions
           (user_id, wallettype, transtype, remark,
            amount,
            useropeningbalance, userclosingbalance,
            opening_balance, closing_balance)
           VALUES (?, 'bonus', 'credit', 'Referral signup bonus',
            ?, ?, ?, ?, ?)`,
          [
            userId,
            REFERRAL_SIGNUP_BONUS,
            uOpen,  uClose,       // user:    5 → 8
            coOpen, coClose,      // company: X → X-3
          ]
        );
      }
    }

    await conn.commit();

    /* ─── Release Lock after commit ─── */
    try {
      await conn.query(`SELECT RELEASE_LOCK('company_balance_lock')`);
    } catch (_) {
      // ignore — lock auto-releases when session ends
    }

    /* ─── Cleanup Redis — after commit so signup can't be reused ─── */
    await Promise.all([
      redis.del(`SIGNUP:${normalizedMobile}`),
      redis.del(`SIGNUP_OTP:${normalizedMobile}`),
      redis.del(`KYC_VERIFIED:${normalizedMobile}`),
    ]);

    return {
      success: true,
      message: "Signup completed successfully",
      data: { userid, usercode, joiningBonus: JOINING_BONUS },
    };

  } catch (err) {

    await conn.rollback();

    try {
      await conn.query(`SELECT RELEASE_LOCK('company_balance_lock')`);
    } catch (_) {
      // ignore
    }

    throw err;

  } finally {

    conn.release(); 

  }
};
 





// export const signupService = async ({ mobile, otp }) => {

//   const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

//   /* OTP CHECK */
//   const savedOtp = await redis.get(`SIGNUP_OTP:${normalizedMobile}`);
//   if (!savedOtp) throw new Error("OTP expired");

//   if (String(savedOtp) !== String(otp))
//     throw new Error("Invalid OTP");


//   /* GET SIGNUP SESSION */
//   const signupRaw = await redis.get(`SIGNUP:${normalizedMobile}`);
//   if (!signupRaw) throw new Error("Signup session expired");

//   const signupData =
//     typeof signupRaw === "string"
//       ? JSON.parse(signupRaw)
//       : signupRaw;


//   const name       = signupData.name;
//   const email      = signupData.email;
//   const region     = signupData.region;
//   const address    = signupData.address || null;
//   const dob        = signupData.dob;
//   const nickname   = signupData.nickname || null;
//   const category   = signupData.category || null;
//   const referralid = signupData.referralid || null;

//   if (!name) throw new Error("Name missing");
//   if (!email) throw new Error("Email missing");
//   if (!dob) throw new Error("DOB missing");


//   /* GENERATE USERCODE */
//   const usercode = generateUserCode();


//   /* GENERATE USERID */
//   const [[lastUser]] = await db.query(
//     "SELECT userid FROM users ORDER BY id DESC LIMIT 1"
//   );

//   const nextNumber = lastUser?.userid
//     ? parseInt(lastUser.userid.replace("PTW", ""), 10) + 1
//     : 1;

//   const userid = "PTW" + String(nextNumber).padStart(6, "0");


//   /* INSERT USER */
//   const [result] = await db.query(
//     `INSERT INTO users
//      (userid, usercode, name, email, mobile, region, address,
//       dob, referralid, nickname, category,
//       email_verify, mobile_verify, created_at)
//      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, NOW())`,
//     [
//       userid,
//       usercode,
//       name,
//       email,
//       normalizedMobile,
//       region,
//       address,
//       dob,
//       referralid,
//       nickname,
//       category
//     ]
//   );

//   const userId = result.insertId;


//   /* EMAIL TOKEN */
//   const emailToken = crypto.randomBytes(32).toString("hex");

//   await db.query(
//     "UPDATE users SET email_token=? WHERE id=?",
//     [emailToken, userId]
//   );


//   /* VERIFY LINK */
//   const verifyLink =
//     `${process.env.BACKEND_URL}/api/auth/verify-email?token=${emailToken}`;


//   /* SEND EMAIL */
//   await sendVerificationEmail({
//     to: email,
//     subject: "Verify your email",
//     html: `
//       <h3>Email Verification</h3>
//       <p>Please click the link below to verify your email</p>
//       <a href="${verifyLink}">Verify Email</a>
//     `
//   });


//   /* CLEANUP REDIS */
//   await Promise.all([
//     redis.del(`SIGNUP:${normalizedMobile}`),
//     redis.del(`SIGNUP_OTP:${normalizedMobile}`)
//   ]);


//   return {
//     success: true,
//     message: "Signup successful. Please verify your email."
//   };

// };
  

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


// export const loginService = async ({ email, mobile, otp }, ipAddress) => {

//   /* ─── Find User ─── */
//   const [users] = await db.query(
//     `SELECT id, usercode, email, mobile, name,
//             loginotp, loginotpexpires, account_status,
//             email_verify, mobile_verify
//      FROM users
//      WHERE (email = ? OR mobile = ?)
//      LIMIT 1`,
//     [email || null, mobile || null]
//   );

//   if (!users.length) throw new Error("User not found");

//   const user = users[0];

//   /* ─── Account Status ─── */
//   if (user.account_status === "deleted")
//     throw new Error("This account has been deleted");

//   if (user.account_status === "paused")
//     throw new Error("Your account is temporarily paused");


//   /* ─── Mobile Verification Check ─── */
//   if (user.mobile_verify !== 1)
//     throw new Error("Please verify your mobile number first");


//   /* ─── Email Verification Check ─── */
//   if (user.email_verify !== 1)
//     throw new Error("Please verify your email before login");


//   /* ─── OTP Validation ─── */
//   if (!user.loginotp)
//     throw new Error("OTP not requested");

//   if (user.loginotp !== otp)
//     throw new Error("Invalid OTP");

//   if (new Date(user.loginotpexpires) < new Date())
//     throw new Error("OTP expired");


//   /* ─── Shift Login Times (Bank Style) ─── */
//   const [result] = await db.query(
//     `UPDATE users
//      SET loginotp         = NULL,
//          loginotpexpires  = NULL,
//          last_login       = current_login,
//          current_login    = NOW(),
//          last_login_ip    = current_login_ip,
//          current_login_ip = ?
//      WHERE id = ?`,
//     [ipAddress || null, user.id]
//   );

//   if (result.affectedRows === 0)
//     throw new Error("Login state update failed");


//   /* ─── Return User ─── */
//   return {
//     id:       user.id,
//     usercode: user.usercode,
//     email:    user.email,
//     mobile:   user.mobile,
//     name:     user.name
//   };
// };

export const loginService = async ({ email, mobile, otp }, ipAddress) => {

  /* ─── Find User ─── */
  const [users] = await db.query(
    `SELECT id, usercode, email, mobile, name,
            loginotp, loginotpexpires, account_status,
            email_verify, mobile_verify, age_verified
     FROM users
     WHERE (email = ? OR mobile = ?)
     LIMIT 1`,
    [email || null, mobile || null]
  );

  if (!users.length)
    throw new Error("User not found");

  const user = users[0];

  /* ─── Account Status ─── */
  if (user.account_status === "deleted")
    throw new Error("This account has been deleted");

  if (user.account_status === "paused")
    throw new Error("Your account is temporarily paused");


  /* ─── Mobile Verification Check ─── */
  if (user.mobile_verify !== 1)
    throw new Error("Please verify your mobile number first");


  /* ─── Email Verification Check ─── */
  if (user.email_verify !== 1)
    throw new Error("Please verify your email before login");


  /* ─── Age Verification Check ─── */
  if (user.age_verified !== 1)
    throw new Error("Age verification required before login");


  /* ─── OTP Validation ─── */
  if (!user.loginotp)
    throw new Error("OTP not requested");

  if (user.loginotp !== otp)
    throw new Error("Invalid OTP");

  if (new Date(user.loginotpexpires) < new Date())
    throw new Error("OTP expired");


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

  if (result.affectedRows === 0)
    throw new Error("Login state update failed");


  /* ─── Return User ─── */
  return {
    id:       user.id,
    usercode: user.usercode,
    email:    user.email,
    mobile:   user.mobile,
    name:     user.name
  };
};


/* ================= PAUSE ACCOUNT ====================== */

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

/* ================= ADMIN LOGIN ========================= */

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


/* ================= SEND EMAIL VERIFICATION LINK ================= */


export const sendEmailVerificationService = async (email) => {

  if (!email) throw new Error("Email required");

  const [[user]] = await db.query(
    `SELECT id, email_verify FROM users WHERE email = ?`,
    [email]
  );

  if (!user) throw new Error("User not found");

  if (user.email_verify === 1)
    throw new Error("Email already verified");

  // generate token
  const token = crypto.randomBytes(32).toString("hex");

  // store token in redis
  await redis.set(`EMAIL_VERIFY:${token}`, user.id, { ex: 3600 });

  const verifyLink = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

  console.log("Email verify link:", verifyLink);

  // ⭐ THIS LINE ACTUALLY SENDS EMAIL
  await sendVerificationEmail(email, verifyLink);

  return {
    success: true,
    message: "Verification email sent"
  };
};
/* ================= VERIFY EMAIL LINK ================= */
export const verifyEmailLinkService = async (token) => {

  if (!token) throw new Error("Invalid verification link");

  const userId = await redis.get(`EMAIL_VERIFY:${token}`);

  if (!userId)
    throw new Error("Verification link expired");

  const [result] = await db.query(
    `UPDATE users
     SET email_verify = 1
     WHERE id = ?`,
    [userId]
  );

  if (result.affectedRows === 0)
    throw new Error("User not found");

  await redis.del(`EMAIL_VERIFY:${token}`);

  return {
    success: true,
    message: "Email verified successfully"
  };
};   












//* ================= CONTACT CHANGE (EMAIL/MOBILE) ================= */


export const requestContactChangeService = async (userId, type, newValue) => {

  const [[user]] = await db.query(
    `SELECT email, mobile FROM users WHERE id = ?`,
    [userId]
  );

  if (!user) throw new Error("User not found");

  const oldEmail = user.email;
  const oldMobile = user.mobile;

  const otp = crypto.randomInt(100000, 999999).toString();

  console.log("Generated OLD OTP:", otp);

  /* store session */

  await redis.set(
    `CHANGE_CONTACT:${userId}`,
    JSON.stringify({ type, newValue }),
    { EX: 300 }
  );

  await redis.set(
    `CHANGE_CONTACT_OLD_OTP:${userId}`,
    otp,
    { EX: 300 }
  );

  /* send OTP */

  if (type === "email") {
    await sendOtpEmail(oldEmail, otp);
  } else {
    console.log(`Send OTP ${otp} to mobile ${oldMobile}`);
  }

  return {
    success: true,
    message: `OTP sent to your registered ${type}`
  };
}; 


export const verifyOldContactService = async (userId, otp) => {

  const savedOtp = await redis.get(`CHANGE_CONTACT_OLD_OTP:${userId}`);

  console.log("Entered OLD OTP:", otp);
  console.log("Redis OLD OTP:", savedOtp);

  if (!savedOtp)
    throw new Error("OTP expired");

  if (String(savedOtp) !== String(otp))
    throw new Error("Invalid OTP");

  const session = await redis.get(`CHANGE_CONTACT:${userId}`);

  if (!session)
    throw new Error("Session expired");

  const parsedSession =
    typeof session === "string" ? JSON.parse(session) : session;

  const { type, newValue } = parsedSession;

  const newOtp = crypto.randomInt(100000, 999999).toString();

  console.log("Generated NEW OTP:", newOtp);

  await redis.set(
    `CHANGE_CONTACT_NEW_OTP:${userId}`,
    newOtp,
    { EX: 300 }
  );

  /* send new OTP */

  if (type === "email") {
    await sendOtpEmail(newValue, newOtp);
  } else {
    console.log(`Send OTP ${newOtp} to new mobile ${newValue}`);
  }

  return {
    success: true,
    message: `OTP sent to new ${type}`
  };
};


export const verifyNewContactService = async (userId, otp) => {

  const savedOtp = await redis.get(`CHANGE_CONTACT_NEW_OTP:${userId}`);

  console.log("Entered NEW OTP:", otp);
  console.log("Redis NEW OTP:", savedOtp);

  if (!savedOtp)
    throw new Error("OTP expired");

  if (String(savedOtp) !== String(otp))
    throw new Error("Invalid OTP");

  const session = await redis.get(`CHANGE_CONTACT:${userId}`);

  if (!session)
    throw new Error("Session expired");

  const parsedSession =
    typeof session === "string" ? JSON.parse(session) : session;

  const { type, newValue } = parsedSession;

  /* update DB */

  if (type === "email") {

    await db.query(
      `UPDATE users SET email = ?, email_verify = 0 WHERE id = ?`,
      [newValue, userId]
    );

  } else {

    await db.query(
      `UPDATE users SET mobile = ?, mobile_verify = 0 WHERE id = ?`,
      [newValue, userId]
    );

  }

  /* cleanup redis */

  await redis.del(`CHANGE_CONTACT:${userId}`);
  await redis.del(`CHANGE_CONTACT_OLD_OTP:${userId}`);
  await redis.del(`CHANGE_CONTACT_NEW_OTP:${userId}`);

  console.log("✅ Contact updated successfully");

  return {
    success: true,
    message: `${type} updated successfully`
  };
};