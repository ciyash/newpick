import db from "../../config/db.js";

export const getUserProfileService = async (userId) => {

  const [[user]] = await db.query(
    `SELECT
        userid,
        usercode,
        name,
        email,
        mobile,
        region,
        category,
        dob,
        created_at
     FROM users
     WHERE id = ?`,
    [userId]
  );

  if (!user) {
    throw new Error("User not found");
  }

  /* --------------------------------
     2️⃣ WALLET DETAILS
  -------------------------------- */
  const [[wallet]] = await db.query(
    `SELECT
        depositwallet,
        earnwallet,
        bonusamount
     FROM wallets
     WHERE user_id = ?`,
    [userId]
  );

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  /* --------------------------------
     3️⃣ MONTHLY DEPOSIT LIMIT
  -------------------------------- */
  const MONTHLY_LIMIT =
    user.category === "students" ? 300 : 1500;

  const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const [[monthly]] = await db.query(
    `SELECT total_added
     FROM monthly_deposits
     WHERE user_id = ? AND ym = ?`,
    [userId, yearMonth]
  );

  const alreadyAdded = monthly ? Number(monthly.total_added) : 0;
  const remainingLimit = Math.max(
    MONTHLY_LIMIT - alreadyAdded,
    0
  );

  /* --------------------------------
     4️⃣ FINAL PROFILE RESPONSE
  -------------------------------- */
  return {
    userid: user.userid,
    usercode: user.usercode,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    region: user.region,
    category: user.category,              // 👈 students / others
    dob: user.dob,
    joinedAt: user.created_at,

    wallet: {
      depositWallet: Number(wallet.depositwallet),
      withdrawWallet: Number(wallet.earnwallet),
      bonusWallet: Number(wallet.bonusamount)
    },

    depositLimits: {
      monthlyLimit: MONTHLY_LIMIT,
      addedThisMonth: alreadyAdded,
      remainingThisMonth: remainingLimit
    }
  };
};
