import db from "../../config/db.js";

import { getSubscriptionStatusService } from "./subscription.service.js";


export const getUserProfileService = async (userId) => {

  /* ================= USER DETAILS ================= */

 
  const [[user]] = await db.query(
  `SELECT 
      userid,
      usercode,
      name,
      email,
      mobile,
      nickname,
      region,
      category,
      dob,
      created_at,
      last_login,
      current_login,
      last_login_ip,
      current_login_ip,
      issofverify,
      kyc_status,
      mobile_verify,
      email_verify,
      account_status          -- ✅ ADD THIS
   FROM users
   WHERE id = ?`,
  [userId]
);

  if (!user) {
    throw new Error("User not found");
  }

   /* ================= NICKNAME ================= */        // ✅ ADD HERE
  const generateNickname = (fullName) => {
    if (!fullName) return null;
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 8);
    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1][0].toUpperCase();
    return `${firstName} ${lastInitial}`;
  };


  /* ================= WALLET =================== */

  const [[wallet]] = await db.query(
    `SELECT 
        depositwallet,
        earnwallet,
        bonusamount,
        deposit_limit,
        iskyc,
        issofverify,
        limit_reduced_once
     FROM wallets
     WHERE user_id = ?`,
    [userId]
  );

  const safeWallet = wallet || {
    depositwallet: 0,
    earnwallet: 0,
    bonusamount: 0,
    deposit_limit: 0,
    iskyc: 0,
    issofverify: 0,
    limit_reduced_once: 0
  };

  const depositWallet = Number(safeWallet.depositwallet);
  const withdrawWallet = Number(safeWallet.earnwallet);
  const bonusWallet = Number(safeWallet.bonusamount);

  const totalWallet = depositWallet + withdrawWallet + bonusWallet;

  /* ================= MONTHLY DEPOSIT ================= */

  const yearMonth = new Date().toISOString().slice(0, 7);

  const [[monthly]] = await db.query(
    `SELECT total_added
     FROM monthly_deposits
     WHERE user_id = ? AND ym = ?`,
    [userId, yearMonth]
  );

  const addedThisMonth = monthly ? Number(monthly.total_added) : 0;

  const monthlyLimit = Number(safeWallet.deposit_limit);

  const remainingThisMonth = Math.max(monthlyLimit - addedThisMonth, 0);

  const canAddCash = remainingThisMonth > 0;

  /* ================= WITHDRAW HISTORY ================= */

  const [withdrawals] = await db.query(
    `SELECT amount, status, created_at
     FROM withdraws
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT 3`,
    [userId]
  );

  /* ================= SUBSCRIPTION ================= */

  const subscription = await getSubscriptionStatusService(userId);

  /* ================= RETURN PROFILE ================= */

  return {

    /* ===== PERSONAL DETAILS ===== */

    personal: {
      userid: user.userid,
      usercode: user.usercode,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      nickname: user.nickname || generateNickname(user.name),
      region: user.region,
      accountStatus: user.account_status,   // ✅ ADD THIS
      isActive: user.account_status === "active",  // ✅ boolean convenience field
      category: user.category,
      dob: user.dob,
      memberSince: user.created_at,

      mobileVerify: user.mobile_verify,
      emailVerify: user.email_verify,

      SOFverify: user.issofverify,
      KYCstatus: user.kyc_status,
      KYCverify: safeWallet.iskyc,
      Walletlimit: safeWallet.limit_reduced_once,

      lastLoginDate: user.last_login
        ? new Date(user.last_login).toLocaleString("en-IN")
        : "First login",

      lastLoginIp: user.last_login_ip || null,

      currentLoginDate: user.current_login
        ? new Date(user.current_login).toLocaleString("en-IN")
        : null,

      currentLoginIp: user.current_login_ip || null
    },

    /* ===== WALLET ===== */

    wallet: {
      depositWallet,
      withdrawWallet,
      bonusWallet,
      totalWallet
    },

    /* ===== DEPOSIT LIMIT ===== */

    depositLimits: {
      monthlyLimit,
      addedThisMonth,
      remainingThisMonth,
      canAddCash
    },

    /* ===== WITHDRAW HISTORY ===== */

    withdrawals: withdrawals || [],

    /* ===== SUBSCRIPTION ===== */

    subscription
  };
};

export const reduceMonthlyLimitService = async (userId, newLimit) => {

  /* --------------------------------
     1️⃣ FETCH USER + CURRENT LIMIT + FLAG
  -------------------------------- */
  const [[data]] = await db.query(
    `SELECT u.category,
            w.deposit_limit,
            w.limit_reduced_once
     FROM users u
     JOIN wallets w ON u.id = w.user_id
     WHERE u.id = ?`,
    [userId]
  );

  if (!data) throw new Error("User not found");

  const currentLimit = Number(data.deposit_limit);

  /* --------------------------------
     ⭐ PERMANENT BLOCK (LIFETIME)
  -------------------------------- */
  if (data.limit_reduced_once) {
    throw new Error(
      "Monthly limit can be reduced only once in your account lifetime"
    );
  }

  /* --------------------------------
     2️⃣ CATEGORY DEFAULT LIMIT
  -------------------------------- */
  const normalizedCategory =
    String(data.category || "").toLowerCase();

  const DEFAULT_LIMIT =
    normalizedCategory === "student" ? 300 : 1500;

  /* --------------------------------
     3️⃣ VALIDATIONS
  -------------------------------- */

  if (newLimit < 100) {
    throw new Error("Minimum allowed limit is £100");
  }

  if (newLimit > DEFAULT_LIMIT) {
    throw new Error(
      `Maximum allowed limit for your account is £${DEFAULT_LIMIT}`
    );
  }

  if (newLimit > currentLimit) {
    throw new Error("Limit increase is not allowed");
  }

  if (newLimit === currentLimit) {
    throw new Error("New limit must be lower than current limit");
  }

  /* --------------------------------
     4️⃣ UPDATE LIMIT + PERMANENT FLAG
  -------------------------------- */
  await db.query(
    `UPDATE wallets
     SET deposit_limit = ?,
         limit_reduced_once = TRUE
     WHERE user_id = ?`,
    [newLimit, userId]
  );
};

   

// feedback service...........................................

export const createFeedbackService = async (userId, data) => {
  const { subject, message, rating, description } = data;

  await db.query(
    `INSERT INTO feedbacks
     (user_id, subject, message, rating, description)
     VALUES (?, ?, ?, ?, ?)`,
    [
      userId,
      subject,
      message,
      rating,
      description || null
    ]
  );

  return {
    success: true,
    message: "Feedback submitted successfully"
  };
};


export const getMyFeedbacksService = async (userId) => {
  const [rows] = await db.query(
    `SELECT
        id,
        subject,
        message,
        rating,
        description,
        created_at
     FROM feedbacks
     WHERE user_id = ?
     ORDER BY id DESC`,
    [userId]
  );

  return rows;
};
