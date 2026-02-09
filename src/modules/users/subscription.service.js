import db from "../../config/db.js";

const PACK_CONFIG = {
  "1M": { months: 1, price: 35, bonus: 5 },
  "3M": { months: 3, price: 100, bonus: 15 }
};

export const buySubscriptionService = async (userId, pack, meta = {}) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    /* --------------------------------------------------
       1️⃣ Lock user row
    -------------------------------------------------- */
    const [[user]] = await conn.query(
      `SELECT
        subscribe,
        subscribeenddate,
        nextsubscribe,
        subscription_bonus_given
       FROM users
       WHERE id = ?
       FOR UPDATE`,
      [userId]
    );

    if (!user) {
      throw new Error("User not found");
    }

    /* --------------------------------------------------
       2️⃣ Lock wallet row
    -------------------------------------------------- */
    const [[wallet]] = await conn.query(
      `SELECT
        depositwallet,
        bonusamount,
        is_frozen
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    if (wallet.is_frozen === 1) {
      throw new Error("Wallet is frozen");
    }

    /* --------------------------------------------------
       3️⃣ Validate pack
    -------------------------------------------------- */
    const config = PACK_CONFIG[pack];
    if (!config) {
      throw new Error("Invalid subscription pack");
    }

    /* --------------------------------------------------
       4️⃣ Deposit wallet balance check
    -------------------------------------------------- */
    if (wallet.depositwallet < config.price) {
      throw new Error("Insufficient deposit wallet balance");
    }

    const openingBalance = wallet.depositwallet;
    const closingBalance = openingBalance - config.price;

    /* --------------------------------------------------
       5️⃣ Debit deposit wallet
    -------------------------------------------------- */
    await conn.query(
      `UPDATE wallets
       SET depositwallet = depositwallet - ?
       WHERE user_id = ?`,
      [config.price, userId]
    );

    /* --------------------------------------------------
       6️⃣ Wallet transaction entry
       ENUM-safe values:
       wallettype = 'deposit'
       transtype  = 'debit'
    -------------------------------------------------- */
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

    const now = new Date();

    /* --------------------------------------------------
       7️⃣ ACTIVE subscription → schedule next
    -------------------------------------------------- */
    if (
      user.subscribe === 1 &&
      user.subscribeenddate &&
      new Date(user.subscribeenddate) >= now
    ) {
      if (user.nextsubscribe === 1) {
        throw new Error("Next subscription already scheduled");
      }

      const start = new Date(user.subscribeenddate);
      start.setSeconds(start.getSeconds() + 1); // prevent overlap

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
        amountDebited: config.price
      };
    }

    /* --------------------------------------------------
       8️⃣ NO ACTIVE subscription → activate now
    -------------------------------------------------- */
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

    /* --------------------------------------------------
       9️⃣ Subscription bonus (FIRST TIME ONLY)
    -------------------------------------------------- */
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




//get subscription status service

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

  if (!user || user.subscribe === 0) {
    return { active: false };
  }

  const now = new Date();

  if (new Date(user.subscribeenddate) < now) {
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

