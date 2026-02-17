import db from "../../config/db.js";

import { getSubscriptionStatusService } from "./subscription.service.js";

// export const getUserProfileService = async (userId) => {

//   const [[user]] = await db.query(
//     `SELECT userid,usercode,name,email,mobile,
//    subscribe,region,category,dob,created_at
//      FROM users
//      WHERE id = ?`,
//     [userId]
//   );

//   const [[wallet]] = await db.query(
//     `SELECT depositwallet, earnwallet, bonusamount, deposit_limit
//      FROM wallets
//      WHERE user_id = ?`,
//     [userId]
//   );

//   const yearMonth = new Date().toISOString().slice(0, 7);

//   const [[monthly]] = await db.query(
//     `SELECT total_added
//      FROM monthly_deposits
//      WHERE user_id = ? AND ym = ?`,
//     [userId, yearMonth]
//   );

//   const added = monthly ? Number(monthly.total_added) : 0;

//   return {
    
//     userid: user.userid,
//     usercode: user.usercode,
//     name: user.name,
//     email: user.email,
//     category: user.category,

//     wallet: {
//       depositWallet: Number(wallet.depositwallet),
//       withdrawWallet: Number(wallet.earnwallet),
//       bonusWallet: Number(wallet.bonusamount)
//     },

//     depositLimits: {
//       monthlyLimit: Number(wallet.deposit_limit),
//       addedThisMonth: added,
//       remainingThisMonth: wallet.deposit_limit - added
//     }
//   };
// };



export const getUserProfileService = async (userId) => {

  // 🧑 USER DETAILS
  const [[user]] = await db.query(
    `SELECT userid,usercode,name,email,mobile,
     subscribe,region,category,dob,created_at
     FROM users
     WHERE id = ?`,
    [userId]
  );

  // 💰 WALLET DETAILS
  const [[wallet]] = await db.query(
    `SELECT depositwallet, earnwallet, bonusamount, deposit_limit
     FROM wallets
     WHERE user_id = ?`,
    [userId]
  );

  // 📅 MONTHLY DEPOSIT
  const yearMonth = new Date().toISOString().slice(0, 7);

  const [[monthly]] = await db.query(
    `SELECT total_added
     FROM monthly_deposits
     WHERE user_id = ? AND ym = ?`,
    [userId, yearMonth]
  );

  const added = monthly ? Number(monthly.total_added) : 0;

  // 🏆 SUBSCRIPTION STATUS — reuse existing service
  const subscription = await getSubscriptionStatusService(userId);

  return {

    userid: user.userid,
    usercode: user.usercode,
    name: user.name,
    email: user.email,
    category: user.category,

    wallet: {
      depositWallet: Number(wallet.depositwallet),
      withdrawWallet: Number(wallet.earnwallet),
      bonusWallet: Number(wallet.bonusamount)
    },

    depositLimits: {
      monthlyLimit: Number(wallet.deposit_limit),
      addedThisMonth: added,
      remainingThisMonth: wallet.deposit_limit - added
    },

    // 🔥 Subscription info included
    subscription
  };
};






export const reduceMonthlyLimitService = async (userId, newLimit) => {

  /* --------------------------------
     1️⃣ FETCH USER + CURRENT LIMIT
  -------------------------------- */
  const [[data]] = await db.query(
    `SELECT u.category, w.deposit_limit
     FROM users u
     JOIN wallets w ON u.id = w.user_id
     WHERE u.id = ?`,
    [userId]
  );

  if (!data) throw new Error("User not found");

  const currentLimit = Number(data.deposit_limit);

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

  // 🔒 Minimum allowed
  if (newLimit < 100) {
    throw new Error("Minimum allowed limit is £100");
  }

  // 🔒 Cannot exceed category default
  if (newLimit > DEFAULT_LIMIT) {
    throw new Error(
      `Maximum allowed limit for your account is £${DEFAULT_LIMIT}`
    );
  }

  // 🔒 Cannot increase limit
  if (newLimit > currentLimit) {
    throw new Error("Limit increase is not allowed");
  }

  // 🔒 Must be lower than current
  if (newLimit === currentLimit) {
    throw new Error("New limit must be lower than current limit");
  }

  /* --------------------------------
     4️⃣ UPDATE WALLET LIMIT
  -------------------------------- */
  await db.query(
    `UPDATE wallets
     SET deposit_limit = ?
     WHERE user_id = ?`,
    [newLimit, userId]
  );
};



// feedback service.......................................................

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
