import db from "../../config/db.js";

/* =====================================================
   SUBSCRIPTION CONFIG
===================================================== */
const PACK_CONFIG = {
  "1M": { months: 1, price: 35, bonus: 5 },
  "3M": { months: 3, price: 100, bonus: 15 }
};

/* =====================================================
   BUY SUBSCRIPTION
===================================================== */
export const buySubscriptionService = async (userId, pack, meta = {}) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    /* --------------------------------
       1️⃣ LOCK USER
    -------------------------------- */
    const [[user]] = await conn.query(
      `SELECT
        subscribe,
        subscribepack,
        subscribestartdate,
        subscribeenddate,
        nextsubscribe,
        subscription_bonus_given
       FROM users
       WHERE id = ?
       FOR UPDATE`,
      [userId]
    );

    if (!user) throw new Error("User not found");

    const now = new Date();

    /* --------------------------------
       🚫 MAX 2 SUBSCRIPTIONS RULE
       (current + next only)
    -------------------------------- */
    if (
      user.subscribe === 1 &&
      user.subscribeenddate &&
      new Date(user.subscribeenddate).getTime() >= now.getTime() &&
      user.nextsubscribe === 1
    ) {
      throw new Error(
        "You already have an active subscription and one scheduled plan. Please wait until your current plan expires."
      );
    }

    /* --------------------------------
       2️⃣ LOCK WALLET
    -------------------------------- */
    const [[wallet]] = await conn.query(
      `SELECT depositwallet, bonusamount, is_frozen
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );

    if (!wallet) throw new Error("Wallet not found");
    if (wallet.is_frozen === 1) throw new Error("Wallet is frozen");

    /* --------------------------------
       3️⃣ VALIDATE PACK
    -------------------------------- */
    const config = PACK_CONFIG[pack];
    if (!config) throw new Error("Invalid subscription pack");

    /* --------------------------------
       4️⃣ BALANCE CHECK
    -------------------------------- */
    if (wallet.depositwallet < config.price) {
      throw new Error("Insufficient deposit wallet balance");
    }

    const openingBalance = wallet.depositwallet;
    const closingBalance = openingBalance - config.price;

    /* --------------------------------
       5️⃣ DEBIT WALLET
    -------------------------------- */
    await conn.query(
      `UPDATE wallets
       SET depositwallet = depositwallet - ?
       WHERE user_id = ?`,
      [config.price, userId]
    );

    /* --------------------------------
       6️⃣ WALLET TRANSACTION
    -------------------------------- */
    await conn.query(
      `INSERT INTO wallet_transactions
       (user_id, wallettype, transtype, remark, amount,
        opening_balance, closing_balance,
        reference_id, transaction_hash,
        ip_address, device)
       VALUES (?, 'deposit', 'debit', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        `Subscription purchase (${pack})`,
        config.price,
        openingBalance,
        closingBalance,
        `SUB-${userId}-${Date.now()}`,
        meta.txnHash || null,
        meta.ip || null,
        meta.device || null
      ]
    );

    /* --------------------------------
       7️⃣ ACTIVE → SCHEDULE NEXT
    -------------------------------- */
    if (
      user.subscribe === 1 &&
      user.subscribeenddate &&
      new Date(user.subscribeenddate).getTime() >= now.getTime()
    ) {
      const start = new Date(user.subscribeenddate);
      start.setSeconds(start.getSeconds() + 1);

      const end = new Date(start);
      end.setMonth(end.getMonth() + config.months);

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
        message: "Subscription purchased & scheduled",
        amountDebited: config.price,
        next: { startDate: start, endDate: end }
      };
    }

    /* --------------------------------
       8️⃣ NO ACTIVE → ACTIVATE NOW
    -------------------------------- */
    const startDate = now;
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + config.months);

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

    /* --------------------------------
       9️⃣ FIRST SUBSCRIPTION BONUS
    -------------------------------- */
    let bonusApplied = false;

    if (user.subscription_bonus_given === 0) {
      await conn.query(
        `UPDATE wallets
         SET bonusamount = bonusamount + ?
         WHERE user_id = ?`,
        [config.bonus, userId]
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
      message: "Subscription purchased & activated",
      amountDebited: config.price,
      bonusApplied,
      bonusAmount: bonusApplied ? config.bonus : 0,
      validTill: endDate
    };

  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
};

/* =====================================================
   GET SUBSCRIPTION STATUS
===================================================== */
export const getSubscriptionStatusService = async (userId) => {
  const [[user]] = await db.query(
    `SELECT
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

  if (!user || user.subscribe !== 1 || !user.subscribeenddate) {
    return { active: false };
  }

  const now = new Date();

  if (new Date(user.subscribeenddate).getTime() < now.getTime()) {
    return { active: false, message: "Subscription expired" };
  }

  return {
    active: true,
    current: {
      plan: user.subscribepack,
      startDate: user.subscribestartdate,
      endDate: user.subscribeenddate
    },
    next: user.nextsubscribe
      ? {
          startDate: user.nextsubscribestartdate,
          endDate: user.nextsubscribeenddate
        }
      : null
  };
};
