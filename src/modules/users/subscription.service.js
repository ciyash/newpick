import db from "../../config/db.js";

export const buySubscriptionService = async (userId, pack) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1️⃣ Fetch user subscription info
    const [[user]] = await conn.query(
      `SELECT
        subscribe,
        subscribeenddate,
        subscription_bonus_given
       FROM users
       WHERE id = ?`,
      [userId]
    );

    if (!user) {
      throw new Error("User not found");
    }

    // 2️⃣ Fetch wallet
    const [[wallet]] = await conn.query(
      `SELECT bonusamount
       FROM wallets
       WHERE user_id = ?`,
      [userId]
    );

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    // 3️⃣ Validate pack
    let months;
    let bonus;

    if (pack === "1M") {
      months = 1;
      bonus = 5;
    } else if (pack === "3M") {
      months = 3;
      bonus = 15;
    } else {
      throw new Error("Invalid subscription pack");
    }

    const now = new Date();

    /**
     * 4️⃣ ACTIVE SUBSCRIPTION
     * → schedule next
     */
    if (
      user.subscribe === 1 &&
      user.subscribeenddate &&
      new Date(user.subscribeenddate) >= now
    ) {
      const start = new Date(user.subscribeenddate);
      const end = new Date(start);
      end.setMonth(end.getMonth() + months);

      await conn.query(
        `UPDATE users SET
          nextsubscribe = 1,
          nextsubscribestartdate = ?,
          nextsubscribeenddate = ?
         WHERE id = ?`,
        [start, end, userId]
      );

      await conn.commit();

      return {
        success: true,
        message: "Subscription scheduled after current plan ends",
        bonusApplied: false
      };
    }

    /**
     * 5️⃣ NO ACTIVE SUBSCRIPTION
     * → start immediately
     */
    const startDate = now;
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + months);

    await conn.query(
      `UPDATE users SET
        subscribe = 1,
        subscribepack = ?,
        subscribestartdate = ?,
        subscribeenddate = ?,
        nextsubscribe = 0,
        nextsubscribestartdate = NULL,
        nextsubscribeenddate = NULL
       WHERE id = ?`,
      [pack, startDate, endDate, userId]
    );

    /**
     * 6️⃣ SUBSCRIPTION BONUS (ONLY FIRST TIME EVER)
     * Joining / referral bonus DOES NOT affect this
     */
    let bonusApplied = false;

    if (user.subscription_bonus_given === 0) {
      await conn.query(
        `UPDATE wallets
         SET bonusamount = bonusamount + ?
         WHERE user_id = ?`,
        [bonus, userId]
      );

      await conn.query(
        `UPDATE users
         SET subscription_bonus_given = 1
         WHERE id = ?`,
        [userId]
      );

      bonusApplied = true;
    }

    await conn.commit();

    return {
      success: true,
      message: "Subscription activated",
      bonusApplied,
      bonusAmount: bonusApplied ? bonus : 0,
      validTill: endDate
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/**
 * GET SUBSCRIPTION STATUS
 */
export const getSubscriptionStatusService = async (userId) => {
  const [[user]] = await db.query(
    `SELECT
      subscribe,
      subscribepack,
      subscribeenddate
     FROM users
     WHERE id = ?`,
    [userId]
  );

  if (
    !user ||
    user.subscribe === 0 ||
    !user.subscribeenddate ||
    new Date(user.subscribeenddate) < new Date()
  ) {
    return {
      active: false,
      message: "Your subscription expired"
    };
  }

  return {
    active: true,
    plan: user.subscribepack,
    validTill: user.subscribeenddate
  };
};
