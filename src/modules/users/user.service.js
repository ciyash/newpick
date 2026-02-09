import db from "../../config/db.js";

export const getUserProfileService = async (userId) => {

  /* --------------------------------
     1️⃣ USER BASIC DETAILS
  -------------------------------- */
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
        created_at,

        -- subscription fields
        subscribe,
        subscribepack,
        subscribestartdate,
        subscribeenddate,
        nextsubscribe,
        nextsubscribestartdate,
        nextsubscribeenddate
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
     4️⃣ SUBSCRIPTION STATUS (INLINE)
  -------------------------------- */
  let subscription = { active: false };

  const now = new Date();

  if (
    user.subscribe === 1 &&
    user.subscribeenddate &&
    new Date(user.subscribeenddate).getTime() >= now.getTime()
  ) {
    subscription = {
      active: true,
      current: {
        plan: user.subscribepack,
        startDate: user.subscribestartdate,
        endDate: user.subscribeenddate
      },
      next: user.nextsubscribe === 1
        ? {
            startDate: user.nextsubscribestartdate,
            endDate: user.nextsubscribeenddate
          }
        : null
    };
  }

  /* --------------------------------
     5️⃣ FINAL PROFILE RESPONSE
  -------------------------------- */
  return {
    userid: user.userid,
    usercode: user.usercode,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    region: user.region,
    category: user.category,
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
    },

    subscription   // 👈 HERE (current + next)
  };
};
