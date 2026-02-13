import db from "../../config/db.js";

const PACK_CONFIG = {
  "1M": { months: 1, price: 35, bonus: 5 },
  "3M": { months: 3, price: 100, bonus: 15 }
};


// export const buySubscriptionService = async (userId, pack, meta = {}) => {
//   let conn;

//   try {
//     conn = await db.getConnection();
//     await conn.beginTransaction();

//     /* ================================
//        1️⃣ LOCK USER
//     ================================= */
//     const [[user]] = await conn.query(
//       `SELECT
//         subscribe,
//         subscribeenddate,
//         nextsubscribe,
//         subscription_bonus_given
//        FROM users
//        WHERE id = ?
//        FOR UPDATE`,
//       [userId]
//     );

//     if (!user) throw new Error("User not found");

//     /* ================================
//        2️⃣ LOCK WALLET
//     ================================= */
//     const [[wallet]] = await conn.query(
//       `SELECT depositwallet, earnwallet, bonusamount, is_frozen
//        FROM wallets
//        WHERE user_id = ?
//        FOR UPDATE`,
//       [userId]
//     );

//     if (!wallet) throw new Error("Wallet not found");
//     if (wallet.is_frozen === 1) throw new Error("Wallet frozen");

//     /* ================================
//        3️⃣ VALIDATE PACK
//     ================================= */
//     const config = PACK_CONFIG[pack];
//     if (!config) throw new Error("Invalid pack");

//     const price = config.price;

//     /* ================================
//        ⭐ WALLET DEDUCTION LOGIC
//        BONUS → EARN → DEPOSIT
//     ================================= */

//     let remaining = price;

//     // 1️⃣ BONUS (max 5%)
//     const maxBonus = price * 0.05;
//     const bonusUse = Math.min(wallet.bonusamount, maxBonus);

//     remaining -= bonusUse;

//     // 2️⃣ EARN WALLET
//     const earnUse = Math.min(wallet.earnwallet, remaining);
//     remaining -= earnUse;

//     // 3️⃣ DEPOSIT WALLET
//     const depositUse = Math.min(wallet.depositwallet, remaining);
//     remaining -= depositUse;

//     if (remaining > 0) {
//       throw new Error("Insufficient balance for subscription");
//     }

//     /* ================================
//        4️⃣ UPDATE WALLET BALANCES
//     ================================= */
//     await conn.query(
//       `UPDATE wallets
//        SET
//          bonusamount = bonusamount - ?,
//          earnwallet = earnwallet - ?,
//          depositwallet = depositwallet - ?
//        WHERE user_id = ?`,
//       [bonusUse, earnUse, depositUse, userId]
//     );

//     /* ================================
//        5️⃣ WALLET TRANSACTION ENTRY
//     ================================= */
//    await conn.query(
//   `INSERT INTO wallet_transactions
//    (user_id, wallettype, transtype, remark, amount,
//     reference_id, ip_address, device)
//    VALUES (?, 'deposit', 'debit', ?, ?, ?, ?, ?)`,
//   [
//     userId,
//     `Subscription purchase (${pack})`,
//     price,
//     `SUB-${userId}-${Date.now()}`,
//     meta.ip || null,
//     meta.device || null
//   ]
// );

    

//     /* ================================
//        6️⃣ ACTIVATE SUBSCRIPTION
//     ================================= */
//     const startDate = new Date();
//     const endDate = new Date();
//     endDate.setMonth(endDate.getMonth() + config.months);

//     await conn.query(
//       `UPDATE users SET
//         subscribe = 1,
//         subscribepack = ?,
//         subscribestartdate = ?,
//         subscribeenddate = ?,
//         nextsubscribe = 0
//        WHERE id = ?`,
//       [pack, startDate, endDate, userId]
//     );

//     /* ================================
//        7️⃣ BONUS FOR FIRST SUB
//     ================================= */
//     if (user.subscription_bonus_given === 0) {
//       await conn.query(
//         `UPDATE wallets
//          SET bonusamount = bonusamount + ?
//          WHERE user_id = ?`,
//         [config.bonus, userId]
//       );

//       await conn.query(
//         `UPDATE users
//          SET subscription_bonus_given = 1
//          WHERE id = ?`,
//         [userId]
//       );
//     }

//     await conn.commit();

//     return {
//       success: true,
//       message: "Subscription activated",
//       deducted: {
//         bonusUsed: bonusUse,
//         earnUsed: earnUse,
//         depositUsed: depositUse
//       },
//       startDate,
//       endDate
//     };

//   } catch (err) {
//     if (conn) await conn.rollback();
//     throw err;
//   } finally {
//     if (conn) conn.release();
//   }
// };


export const buySubscriptionService = async (userId, pack, meta = {}) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    /* ================================
       1️⃣ LOCK USER
    ================================= */
    const [[user]] = await conn.query(
      `SELECT
        subscribe,
        subscribeenddate,
        nextsubscribe,
        subscription_bonus_given,
        subscription_count
       FROM users
       WHERE id = ?
       FOR UPDATE`,
      [userId]
    );

    if (!user) throw new Error("User not found");

    /* 🚫 MAX 2 TIMES ONLY */
    if (user.subscription_count >= 2) {
      throw new Error("Subscription allowed only 2 times");
    }

    /* ================================
       2️⃣ LOCK WALLET
    ================================= */
    const [[wallet]] = await conn.query(
      `SELECT depositwallet, earnwallet, bonusamount, is_frozen
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );

    if (!wallet) throw new Error("Wallet not found");
    if (wallet.is_frozen === 1) throw new Error("Wallet frozen");

    /* ================================
       3️⃣ VALIDATE PACK
    ================================= */
    const config = PACK_CONFIG[pack];
    if (!config) throw new Error("Invalid pack");

    const price = config.price;

    /* ================================
       ⭐ WALLET DEDUCTION LOGIC
       BONUS (5%) → EARN → DEPOSIT
    ================================= */

    let remaining = price;

    // ⭐ BONUS — max 5% of subscription price
    const maxBonusAllowed = price * 0.05;
    const bonusUse = Math.min(wallet.bonusamount, maxBonusAllowed);

    remaining -= bonusUse;

    // ⭐ EARN WALLET
    const earnUse = Math.min(wallet.earnwallet, remaining);
    remaining -= earnUse;

    // ⭐ DEPOSIT WALLET
    const depositUse = Math.min(wallet.depositwallet, remaining);
    remaining -= depositUse;

    if (remaining > 0) {
      throw new Error("Insufficient balance for subscription");
    }

    /* ================================
       4️⃣ UPDATE WALLET
    ================================= */
    await conn.query(
      `UPDATE wallets
       SET
         bonusamount = bonusamount - ?,
         earnwallet = earnwallet - ?,
         depositwallet = depositwallet - ?
       WHERE user_id = ?`,
      [bonusUse, earnUse, depositUse, userId]
    );

    /* ================================
       5️⃣ WALLET TRANSACTION ENTRY
    ================================= */
    await conn.query(
      `INSERT INTO wallet_transactions
       (user_id, wallettype, transtype, remark, amount,
        reference_id, ip_address, device)
       VALUES (?, 'deposit', 'debit', ?, ?, ?, ?, ?)`,
      [
        userId,
        `Subscription purchase (${pack})`,
        price,
        `SUB-${userId}-${Date.now()}`,
        meta.ip || null,
        meta.device || null
      ]
    );

    /* ================================
       6️⃣ ACTIVATE SUBSCRIPTION
    ================================= */
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + config.months);

    await conn.query(
      `UPDATE users SET
        subscribe = 1,
        subscribepack = ?,
        subscribestartdate = ?,
        subscribeenddate = ?,
        nextsubscribe = 0
       WHERE id = ?`,
      [pack, startDate, endDate, userId]
    );

    /* ⭐ INCREMENT SUB COUNT */
    await conn.query(
      `UPDATE users
       SET subscription_count = subscription_count + 1
       WHERE id = ?`,
      [userId]
    );

    /* ================================
       7️⃣ FIRST SUB BONUS
    ================================= */
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
      deducted: {
        bonusUsed: bonusUse,
        earnUsed: earnUse,
        depositUsed: depositUse
      },
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
