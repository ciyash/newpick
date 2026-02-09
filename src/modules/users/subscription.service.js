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

    /* --------------------------------
       1️⃣ LOCK USER ROW
    -------------------------------- */
    const [[user]] = await conn.query(
      `SELECT
        subscribe,
        subscribepack,
        subscribestartdate,
        subscribeenddate,
        nextsubscribe,
        nextsubscribestartdate,
        nextsubscribeenddate,
        subscription_bonus_given
       FROM users
       WHERE id = ?
       FOR UPDATE`,
      [userId]
    );

    if (!user) {
      throw new Error("User not found");
    }

    /* --------------------------------
       2️⃣ LOCK WALLET ROW
    -------------------------------- */
    const [[wallet]] = await conn.query(
      `SELECT depositwallet, is_frozen
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
    if (!config) {
      throw new Error("Invalid subscription pack");
    }

    /* --------------------------------
       4️⃣ HARD BLOCK: ONLY 2 PLANS ALLOWED
       (current + next)
    -------------------------------- */
    if (user.subscribe === 1 && user.nextsubscribe === 1) {
      throw new Error(
        "You already have an active subscription and one upcoming plan. Please wait until your current plan expires."
      );
    }

    /* --------------------------------
       5️⃣ CHECK DEPOSIT BALANCE
    -------------------------------- */
    if (wallet.depositwallet < config.price) {
      throw new Error("Insufficient deposit wallet balance");
    }

    const now = new Date();

  
    const isActive =
  Number(user.subscribe) === 1 &&
  user.subscribeenddate !== null &&
  new Date(user.subscribeenddate).getTime() > now.getTime();

    /* =====================================================
       CASE 1️⃣ ACTIVE SUBSCRIPTION → SCHEDULE NEXT
    ===================================================== */
    if (isActive) {
      const start = new Date(user.subscribeenddate);
      start.setSeconds(start.getSeconds() + 1); // avoid overlap

      const end = new Date(start);
      end.setMonth(end.getMonth() + config.months);

      // 💰 Debit wallet
      await conn.query(
        `UPDATE wallets
         SET depositwallet = depositwallet - ?
         WHERE user_id = ?`,
        [config.price, userId]
      );

      // 🧾 Wallet transaction
      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount,
          opening_balance, closing_balance,
          reference_id, ip_address, device)
         VALUES (?, 'deposit', 'debit', ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          `Subscription queued (${pack})`,
          config.price,
          wallet.depositwallet,
          wallet.depositwallet - config.price,
          `SUB-NEXT-${userId}-${Date.now()}`,
          meta.ip || null,
          meta.device || null
        ]
      );

      // 📅 Schedule next
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
        message: "Subscription scheduled after current plan",
        type: "NEXT",
        startDate: start,
        endDate: end
      };
    }

    /* =====================================================
       CASE 2️⃣ NO ACTIVE SUBSCRIPTION → ACTIVATE NOW
    ===================================================== */
    const startDate = now;
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + config.months);

    // 💰 Debit wallet
    await conn.query(
      `UPDATE wallets
       SET depositwallet = depositwallet - ?
       WHERE user_id = ?`,
      [config.price, userId]
    );

    // 🧾 Wallet transaction
    await conn.query(
      `INSERT INTO wallet_transactions
       (user_id, wallettype, transtype, remark, amount,
        opening_balance, closing_balance,
        reference_id, ip_address, device)
       VALUES (?, 'deposit', 'debit', ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        `Subscription activated (${pack})`,
        config.price,
        wallet.depositwallet,
        wallet.depositwallet - config.price,
        `SUB-CUR-${userId}-${Date.now()}`,
        meta.ip || null,
        meta.device || null
      ]
    );

    // 📅 Activate subscription
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
       🎁 BONUS (FIRST SUBSCRIPTION ONLY)
    -------------------------------- */
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
    }

    await conn.commit();

    return {
      success: true,
      message: "Subscription activated",
      type: "CURRENT",
      startDate,
      endDate
    };

  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
};

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
