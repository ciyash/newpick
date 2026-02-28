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
//         subscription_bonus_given,
//         subscription_count
//        FROM users
//        WHERE id = ?
//        FOR UPDATE`,
//       [userId]
//     );

//     if (!user) throw new Error("User not found");

//     if (user.subscription_count >= 2) {
//       throw new Error("Subscription allowed only 2 times");
//     }

//     /* ================================
//        2️⃣ VALIDATE PACK
//     ================================= */
//     const config = PACK_CONFIG[pack];
//     if (!config) throw new Error("Invalid pack");

//     /* ================================
//        3️⃣ LOCK WALLET
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

//     const price = config.price;

//     /* ================================
//        ⭐ WALLET DEDUCTION
//        BONUS → EARN → DEPOSIT
//     ================================= */
//     let remaining = price;

//     const maxBonusAllowed = price * 0.05;
//     const bonusUse = Math.min(wallet.bonusamount, maxBonusAllowed);
//     remaining -= bonusUse;

//     const earnUse = Math.min(wallet.earnwallet, remaining);
//     remaining -= earnUse;

//     const depositUse = Math.min(wallet.depositwallet, remaining);
//     remaining -= depositUse;

//     if (remaining > 0) {
//       throw new Error("Insufficient balance for subscription");
//     }

//     /* ================================
//        4️⃣ UPDATE WALLET
//     ================================= */
//     await conn.query(
//       `UPDATE wallets SET
//          bonusamount = bonusamount - ?,
//          earnwallet = earnwallet - ?,
//          depositwallet = depositwallet - ?
//        WHERE user_id = ?`,
//       [bonusUse, earnUse, depositUse, userId]
//     );

//     /* ================================
//        5️⃣ WALLET TRANSACTION ENTRY
//     ================================= */
//     await conn.query(
//       `INSERT INTO wallet_transactions
//        (user_id, wallettype, transtype, remark, amount,
//         reference_id, ip_address, device)
//        VALUES (?, 'deposit', 'debit', ?, ?, ?, ?, ?)`,
//       [
//         userId,
//         `Subscription purchase (${pack})`,
//         price,
//         `SUB-${userId}-${Date.now()}`,
//         meta.ip || null,
//         meta.device || null
//       ]
//     );

//     /* ================================
//        6️⃣ ACTIVATE OR QUEUE SUB
//     ================================= */
//     const now = new Date();

//     const hasActive =
//       user.subscribe === 1 &&
//       user.subscribeenddate &&
//       new Date(user.subscribeenddate) > now;

//     let startDate, endDate;

//     if (hasActive) {

//       // 🔥 allow queue only last 5 days before expiry
//       const expiryDate = new Date(user.subscribeenddate);
//       const diffTime = expiryDate - now;
//       const diffDays = diffTime / (1000 * 60 * 60 * 24);

//       if (diffDays > 5) {
//         throw new Error(
//           "Next subscription allowed only within 5 days before expiry"
//         );
//       }

//       // 🔴 Prevent multiple queued subscriptions
//       if (user.nextsubscribe === 1) {
//         throw new Error("Next subscription already queued");
//       }

//       // 🟡 ADD AS NEXT SUBSCRIPTION
//       startDate = new Date(user.subscribeenddate);
//       endDate = new Date(startDate);
//       endDate.setMonth(endDate.getMonth() + config.months);

//       await conn.query(
//         `UPDATE users SET
//           nextsubscribe = 1,
//           nextsubscribepack = ?,
//           nextsubscribestartdate = ?,
//           nextsubscribeenddate = ?
//          WHERE id = ?`,
//         [pack, startDate, endDate, userId]
//       );

//     } else {

//       // 🟢 START IMMEDIATELY
//       startDate = now;
//       endDate = new Date(now);
//       endDate.setMonth(endDate.getMonth() + config.months);

//       await conn.query(
//         `UPDATE users SET
//           subscribe = 1,
//           subscribepack = ?,
//           subscribestartdate = ?,
//           subscribeenddate = ?
//          WHERE id = ?`,
//         [pack, startDate, endDate, userId]
//       );
//     }

//     /* ================================
//        ⭐ INCREMENT COUNT
//     ================================= */
//     await conn.query(
//       `UPDATE users
//        SET subscription_count = subscription_count + 1
//        WHERE id = ?`,
//       [userId]
//     );

//     /* ================================
//        ⭐ FIRST SUB BONUS
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
//       message: hasActive
//         ? "Subscription added to queue"
//         : "Subscription activated",
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

    if (user.subscription_count >= 2) {
      throw new Error("Subscription allowed only 2 times");
    }

    /* ================================
       2️⃣ VALIDATE PACK
    ================================= */
    const config = PACK_CONFIG[pack];
    if (!config) throw new Error("Invalid pack");

    /* ================================
       3️⃣ LOCK WALLET
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

    const price = config.price;

    /* ================================
       ⭐ WALLET DEDUCTION
       BONUS → EARN → DEPOSIT
    ================================= */
    let remaining = price;

    const maxBonusAllowed = price * 0.05;
    const bonusUse = Math.min(wallet.bonusamount, maxBonusAllowed);
    remaining -= bonusUse;

    const earnUse = Math.min(wallet.earnwallet, remaining);
    remaining -= earnUse;

    const depositUse = Math.min(wallet.depositwallet, remaining);
    remaining -= depositUse;

    if (remaining > 0) {
      throw new Error("Insufficient balance for subscription");
    }

    /* ================================
       4️⃣ UPDATE WALLET BALANCES
    ================================= */
    await conn.query(
      `UPDATE wallets SET
         bonusamount = bonusamount - ?,
         earnwallet = earnwallet - ?,
         depositwallet = depositwallet - ?
       WHERE user_id = ?`,
      [bonusUse, earnUse, depositUse, userId]
    );

    const referenceId = `SUB-${userId}-${Date.now()}`;

    /* ================================
       5️⃣ WALLET TRANSACTIONS (DEBIT)
    ================================= */

    // BONUS debit
    if (bonusUse > 0) {
      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount, reference_id, ip_address, device)
         VALUES (?, 'bonus', 'debit', ?, ?, ?, ?, ?)`,
        [
          userId,
          `Subscription purchase (${pack})`,
          bonusUse,
          referenceId,
          meta.ip || null,
          meta.device || null
        ]
      );
    }

    // EARN debit
    if (earnUse > 0) {
      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount, reference_id, ip_address, device)
         VALUES (?, 'earn', 'debit', ?, ?, ?, ?, ?)`,
        [
          userId,
          `Subscription purchase (${pack})`,
          earnUse,
          referenceId,
          meta.ip || null,
          meta.device || null
        ]
      );
    }

    // DEPOSIT debit
    if (depositUse > 0) {
      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount, reference_id, ip_address, device)
         VALUES (?, 'deposit', 'debit', ?, ?, ?, ?, ?)`,
        [
          userId,
          `Subscription purchase (${pack})`,
          depositUse,
          referenceId,
          meta.ip || null,
          meta.device || null
        ]
      );
    }

    /* ================================
       6️⃣ ACTIVATE OR QUEUE SUB
    ================================= */
    const now = new Date();
    const hasActive =
      user.subscribe === 1 &&
      user.subscribeenddate &&
      new Date(user.subscribeenddate) > now;

    let startDate, endDate;

    if (hasActive) {
      const expiryDate = new Date(user.subscribeenddate);
      const diffDays = (expiryDate - now) / (1000 * 60 * 60 * 24);

      if (diffDays > 5) {
        throw new Error("Next subscription allowed only within 5 days before expiry");
      }

      if (user.nextsubscribe === 1) {
        throw new Error("Next subscription already queued");
      }

      startDate = new Date(user.subscribeenddate);
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + config.months);

      await conn.query(
        `UPDATE users SET
          nextsubscribe = 1,
          nextsubscribepack = ?,
          nextsubscribestartdate = ?,
          nextsubscribeenddate = ?
         WHERE id = ?`,
        [pack, startDate, endDate, userId]
      );

    } else {
      startDate = now;
      endDate = new Date(now);
      endDate.setMonth(endDate.getMonth() + config.months);

      await conn.query(
        `UPDATE users SET
          subscribe = 1,
          subscribepack = ?,
          subscribestartdate = ?,
          subscribeenddate = ?
         WHERE id = ?`,
        [pack, startDate, endDate, userId]
      );
    }

    /* ================================
       ⭐ INCREMENT COUNT
    ================================= */
    await conn.query(
      `UPDATE users
       SET subscription_count = subscription_count + 1
       WHERE id = ?`,
      [userId]
    );

    /* ================================
       ⭐ FIRST SUB BONUS CREDIT
    ================================= */
    if (user.subscription_bonus_given === 0) {
      await conn.query(
        `UPDATE wallets
         SET bonusamount = bonusamount + ?
         WHERE user_id = ?`,
        [config.bonus, userId]
      );

      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount, reference_id)
         VALUES (?, 'bonus', 'credit', ?, ?, ?)`,
        [
          userId,
          "Subscription Bonus",
          config.bonus,
          `SUBBONUS-${userId}-${Date.now()}`
        ]
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
      message: hasActive
        ? "Subscription added to queue"
        : "Subscription activated",
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
  

