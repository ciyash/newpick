import db from "../../config/db.js";

/* ================================
   HELPER: Get pack config from DB
================================= */
const getPackConfig = async (packName) => {
  const [[pack]] = await db.query(
    `SELECT package_name, amount, bonus, duration
     FROM subscription_packages
     WHERE package_name = ? AND status = 'active'`,
    [packName]
  );
  if (!pack) throw new Error("Invalid pack");

  const months = pack.duration === "monthly" ? 1 : pack.duration === "quarterly" ? 3 : null;
  if (!months) throw new Error("Invalid pack duration");

  return {
    months,
    price: Number(pack.amount),
    bonus: Number(pack.bonus || 0),
    period: pack.duration
  };
};

/* ================================
   BUY SUBSCRIPTION
================================= */
// export const buySubscriptionService = async (userId, pack, meta = {}) => {
//   let conn;

//   if (!userId) throw new Error("Invalid user ID");
//   const safeUserId = userId;

//   if (typeof pack !== "string" || !pack.trim()) throw new Error("Invalid pack");
//   const safePack = pack.trim();

//   const safeIp     = typeof meta.ip     === "string" ? meta.ip.slice(0, 45)     : null;
//   const safeDevice = typeof meta.device === "string" ? meta.device.slice(0, 200) : null;

//   try {
//     conn = await db.getConnection();
//     await conn.beginTransaction();

//     /* ================================
//        1️⃣ LOCK USER
//     ================================= */
//     const [[user]] = await conn.query(
//       `SELECT
//          subscribe, subscribeenddate, nextsubscribe,
//          subscription_bonus_given, subscription_count
//        FROM users
//        WHERE id = ?
//        FOR UPDATE`,
//       [safeUserId]
//     );
//     if (!user) throw new Error("User not found");

//     /* ================================
//        2️⃣ VALIDATE PACK FROM DB
//     ================================= */
//     const [[packRow]] = await conn.query(
//       `SELECT package_name, amount, bonus, duration
//        FROM subscription_packages
//        WHERE package_name = ? AND status = 'active'`,
//       [safePack]
//     );
//     if (!packRow) throw new Error("Invalid pack");

//     const months = packRow.duration === "monthly" ? 1 : packRow.duration === "quarterly" ? 3 : null;
//     if (!months) throw new Error("Invalid pack duration");

//     const price  = Number(packRow.amount);
//     const bonus  = Number(packRow.bonus || 0);
//     const period = packRow.duration;

//     if (!price || price <= 0) throw new Error("Invalid pack price");

//     /* ================================
//        3️⃣ LOCK WALLET
//     ================================= */
//     const [[wallet]] = await conn.query(
//       `SELECT depositwallet, earnwallet, bonusamount, is_frozen
//        FROM wallets
//        WHERE user_id = ?
//        FOR UPDATE`,
//       [safeUserId]
//     );
//     if (!wallet)                        throw new Error("Wallet not found");
//     if (Number(wallet.is_frozen) === 1) throw new Error("Wallet frozen");

//     /* ================================
//        4️⃣ VALIDATE SUBSCRIPTION STATE
//     ================================= */
//     const now = new Date();
//     const hasActive =
//       Number(user.subscribe) === 1 &&
//       user.subscribeenddate &&
//       new Date(user.subscribeenddate) > now;

//     let startDate, endDate;

//     if (hasActive) {
//       if (Number(user.nextsubscribe) === 1) {
//         throw new Error("Next subscription already queued");
//       }

//       const expiryDate = new Date(user.subscribeenddate);
//       const diffDays   = (expiryDate - now) / (1000 * 60 * 60 * 24);

//       if (diffDays > 5) {
//         const availableFrom = new Date(expiryDate);
//         availableFrom.setDate(availableFrom.getDate() - 5);
//         const formatted = availableFrom.toLocaleDateString("en-GB", {
//           day: "2-digit", month: "long", year: "numeric",
//         });
//         throw new Error(`Next subscription can be purchased from ${formatted}`);
//       }

//       startDate = new Date(user.subscribeenddate);
//       endDate   = new Date(startDate);
//       endDate.setMonth(endDate.getMonth() + months);
//     } else {
//       startDate = now;
//       endDate   = new Date(now);
//       endDate.setMonth(endDate.getMonth() + months);
//     }

//     if (isNaN(endDate.getTime())) throw new Error("Failed to calculate subscription end date");

//     /* ================================
//        5️⃣ WALLET DEDUCTION LOGIC
//     ================================= */
//     const earnBalance    = Number(wallet.earnwallet    || 0);
//     const depositBalance = Number(wallet.depositwallet || 0);

//     let remaining = price;

//     const earnUse    = Math.min(earnBalance, remaining);
//     remaining        = Number((remaining - earnUse).toFixed(2));

//     const depositUse = Math.min(depositBalance, remaining);
//     remaining        = Number((remaining - depositUse).toFixed(2));

//     if (remaining > 0) throw new Error("Insufficient balance for subscription");

//     /* ================================
//        6️⃣ OPENING / CLOSING BALANCES
//     ================================= */
//     const bonusBalance = Number(wallet.bonusamount || 0);
//     let userBalance    = Number((earnBalance + depositBalance + bonusBalance).toFixed(2));
//     let bonusRunning   = bonusBalance;

//     /* ================================
//        7️⃣ GET COMPANY LAST BALANCE
//     ================================= */
//     const [[companyLast]] = await conn.query(
//       `SELECT closing_balance
//        FROM wallet_transactions
//        WHERE closing_balance != 0
//        ORDER BY id DESC
//        LIMIT 1
//        FOR UPDATE`
//     );
//     let companyBalance = Number(companyLast?.closing_balance || 0);

//     /* ================================
//        8️⃣ UPDATE WALLET BALANCES
//     ================================= */
//     const [walletUpdate] = await conn.query(
//       `UPDATE wallets SET
//          earnwallet    = earnwallet    - ?,
//          depositwallet = depositwallet - ?
//        WHERE user_id = ?
//          AND earnwallet    >= ?
//          AND depositwallet >= ?`,
//       [earnUse, depositUse, safeUserId, earnUse, depositUse]
//     );
//     if (walletUpdate.affectedRows === 0) throw new Error("Insufficient balance for subscription");

//     /* ================================
//        9️⃣ REFERENCE IDs
//     ================================= */
//     const referenceId      = `SUB-${safeUserId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
//     const bonusReferenceId = `SUBBONUS-${safeUserId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

//     /* ================================
//        🔟 WALLET TRANSACTIONS
//     ================================= */

//     // ── Earn wallet debit ──
//     if (earnUse > 0) {
//       const uOpen  = userBalance;
//       const uClose = Number((userBalance - earnUse).toFixed(2));
//       userBalance  = uClose;

//       const coOpen  = companyBalance;
//       const coClose = Number((companyBalance + earnUse).toFixed(2));
//       companyBalance = coClose;

//       await conn.query(
//         `INSERT INTO wallet_transactions
//          (user_id, wallettype, transtype, remark, amount,
//           useropeningbalance, userclosingbalance,
//           opening_balance, closing_balance,
//           reference_id, ip_address, device)
//          VALUES (?, 'subscribe', 'debit', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//         [safeUserId, `Subscription purchase (${safePack})`, earnUse,
//          uOpen, uClose, coOpen, coClose, referenceId, safeIp, safeDevice]
//       );
//     }

//     // ── Deposit wallet debit ──
//     if (depositUse > 0) {
//       const uOpen  = userBalance;
//       const uClose = Number((userBalance - depositUse).toFixed(2));
//       userBalance  = uClose;

//       const coOpen  = companyBalance;
//       const coClose = Number((companyBalance + depositUse).toFixed(2));
//       companyBalance = coClose;

//       await conn.query(
//         `INSERT INTO wallet_transactions
//          (user_id, wallettype, transtype, remark, amount,
//           useropeningbalance, userclosingbalance,
//           opening_balance, closing_balance,
//           reference_id, ip_address, device)
//          VALUES (?, 'subscribe', 'debit', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//         [safeUserId, `Subscription purchase (${safePack})`, depositUse,
//          uOpen, uClose, coOpen, coClose, referenceId, safeIp, safeDevice]
//       );
//     }

//     // ── Bonus credit (first sub only) ──
//     if (Number(user.subscription_bonus_given) === 0 && bonus > 0) {
//       const uOpen  = bonusRunning;
//       const uClose = Number((bonusRunning + bonus).toFixed(2));
//       bonusRunning = uClose;

//       const coOpen  = companyBalance;
//       const coClose = Number((companyBalance - bonus).toFixed(2));
//       companyBalance = coClose;

//       await conn.query(
//         `UPDATE wallets SET bonusamount = bonusamount + ? WHERE user_id = ?`,
//         [bonus, safeUserId]
//       );

//       await conn.query(
//         `INSERT INTO wallet_transactions
//          (user_id, wallettype, transtype, remark, amount,
//           useropeningbalance, userclosingbalance,
//           opening_balance, closing_balance, reference_id)
//          VALUES (?, 'bonus', 'credit', ?, ?, ?, ?, ?, ?, ?)`,
//         [safeUserId, `Subscription bonus (${safePack})`, bonus,
//          uOpen, uClose, coOpen, coClose, bonusReferenceId]
//       );

//       await conn.query(
//         `UPDATE users SET subscription_bonus_given = 1 WHERE id = ?`,
//         [safeUserId]
//       );
//     }

//     /* ================================
//        1️⃣1️⃣ ACTIVATE OR QUEUE
//     ================================= */
//     if (hasActive) {
//       await conn.query(
//         `UPDATE users SET
//            nextsubscribe          = 1,
//            nextsubscribepack      = ?,
//            nextsubscribestartdate = ?,
//            nextsubscribeenddate   = ?
//          WHERE id = ?`,
//         [safePack, startDate, endDate, safeUserId]
//       );
//     } else {
//       await conn.query(
//         `UPDATE users SET
//            subscribe          = 1,
//            subscribepack      = ?,
//            subscribestartdate = ?,
//            subscribeenddate   = ?
//          WHERE id = ?`,
//         [safePack, startDate, endDate, safeUserId]
//       );
//     }

//     /* ================================
//        1️⃣2️⃣ INSERT INTO SUBSCRIPTIONS
//     ================================= */
//     await conn.query(
//       `INSERT INTO subscriptions
//        (user_id, package_name, amount, period, status,
//         subscription_date, subscription_end, renewal_count,
//         auto_renew, discount, final_amount, remark,
//         created_at, updated_at)
//        VALUES (?, ?, ?, ?, 'success', ?, ?, 0, 0, 0.00, ?, ?, NOW(), NOW())`,
//       [safeUserId, safePack, price, period, startDate, endDate, price,
//        hasActive ? `Queued subscription (${safePack})` : `New subscription (${safePack})`]
//     );

//     /* ================================
//        1️⃣3️⃣ INCREMENT SUBSCRIPTION COUNT
//     ================================= */
//     await conn.query(
//       `UPDATE users SET subscription_count = subscription_count + 1 WHERE id = ?`,
//       [safeUserId]
//     );

//     await conn.commit();

//     return {
//       success: true,
//       message: hasActive ? "Subscription added to queue" : "Subscription activated",
//       startDate,
//       endDate,
//       deduction: {
//         earnUsed:    earnUse,
//         depositUsed: depositUse,
//         bonusGiven:  Number(user.subscription_bonus_given) === 0 ? bonus : 0,
//       },
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

  if (!userId) throw new Error("Invalid user ID");
  const safeUserId = userId;

  if (typeof pack !== "string" || !pack.trim()) throw new Error("Invalid pack");
  const safePack = pack.trim();

  const safeIp     = typeof meta.ip     === "string" ? meta.ip.slice(0, 45)     : null;
  const safeDevice = typeof meta.device === "string" ? meta.device.slice(0, 200) : null;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    /* ================================
       1️⃣ LOCK USER
    ================================= */
    const [[user]] = await conn.query(
      `SELECT
         subscribe, subscribeenddate, nextsubscribe,
         subscription_bonus_given, subscription_count
       FROM users
       WHERE id = ?
       FOR UPDATE`,
      [safeUserId]
    );
    if (!user) throw new Error("User not found");

    /* ================================
       2️⃣ VALIDATE PACK FROM DB
    ================================= */
    const [[packRow]] = await conn.query(
      `SELECT package_name, amount, bonus, duration
       FROM subscription_packages
       WHERE duration = ? AND status = 'active'`,
      [safePack]
    );
    if (!packRow) throw new Error("Invalid pack");

    const months = packRow.duration === "1M" ? 1 : packRow.duration === "3M" ? 3 : null;
    if (!months) throw new Error("Invalid pack duration");

    const price  = Number(packRow.amount);
    const bonus  = Number(packRow.bonus || 0);
  const period = packRow.duration === "1M" ? "monthly" : "quarterly";

    if (!price || price <= 0) throw new Error("Invalid pack price");

    /* ================================
       3️⃣ LOCK WALLET
    ================================= */
    const [[wallet]] = await conn.query(
      `SELECT depositwallet, earnwallet, bonusamount, is_frozen
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [safeUserId]
    );
    if (!wallet)                        throw new Error("Wallet not found");
    if (Number(wallet.is_frozen) === 1) throw new Error("Wallet frozen");

    /* ================================
       4️⃣ VALIDATE SUBSCRIPTION STATE
    ================================= */
    const now = new Date();
    const hasActive =
      Number(user.subscribe) === 1 &&
      user.subscribeenddate &&
      new Date(user.subscribeenddate) > now;

    let startDate, endDate;

    if (hasActive) {
      if (Number(user.nextsubscribe) === 1) {
        throw new Error("Next subscription already queued");
      }

      const expiryDate = new Date(user.subscribeenddate);
      const diffDays   = (expiryDate - now) / (1000 * 60 * 60 * 24);

      if (diffDays > 5) {
        const availableFrom = new Date(expiryDate);
        availableFrom.setDate(availableFrom.getDate() - 5);
        const formatted = availableFrom.toLocaleDateString("en-GB", {
          day: "2-digit", month: "long", year: "numeric",
        });
        throw new Error(`Next subscription can be purchased from ${formatted}`);
      }

      startDate = new Date(user.subscribeenddate);
      endDate   = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + months);
    } else {
      startDate = now;
      endDate   = new Date(now);
      endDate.setMonth(endDate.getMonth() + months);
    }

    if (isNaN(endDate.getTime())) throw new Error("Failed to calculate subscription end date");

    /* ================================
       5️⃣ WALLET DEDUCTION LOGIC
    ================================= */
    const earnBalance    = Number(wallet.earnwallet    || 0);
    const depositBalance = Number(wallet.depositwallet || 0);

    let remaining = price;

    const earnUse    = Math.min(earnBalance, remaining);
    remaining        = Number((remaining - earnUse).toFixed(2));

    const depositUse = Math.min(depositBalance, remaining);
    remaining        = Number((remaining - depositUse).toFixed(2));

    // ✅ LOG HERE — after all variables are defined
    console.log("DEBUG wallet:", {
      earnBalance,
      depositBalance,
      price,
      earnUse,
      depositUse,
      remaining
    });

    if (remaining > 0) throw new Error("Insufficient balance for subscription");

    /* ================================
       6️⃣ OPENING / CLOSING BALANCES
    ================================= */
    const bonusBalance = Number(wallet.bonusamount || 0);
    let userBalance    = Number((earnBalance + depositBalance + bonusBalance).toFixed(2));
    let bonusRunning   = bonusBalance;

    /* ================================
       7️⃣ GET COMPANY LAST BALANCE
    ================================= */
    const [[companyLast]] = await conn.query(
      `SELECT closing_balance
       FROM wallet_transactions
       WHERE closing_balance != 0
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`
    );
    let companyBalance = Number(companyLast?.closing_balance || 0);

    /* ================================
       8️⃣ UPDATE WALLET BALANCES
    ================================= */
    const [walletUpdate] = await conn.query(
      `UPDATE wallets SET
         earnwallet    = earnwallet    - ?,
         depositwallet = depositwallet - ?
       WHERE user_id = ?
         AND earnwallet    >= ?
         AND depositwallet >= ?`,
      [earnUse, depositUse, safeUserId, earnUse, depositUse]
    );
    if (walletUpdate.affectedRows === 0) throw new Error("Insufficient balance for subscription");

    /* ================================
       9️⃣ REFERENCE IDs
    ================================= */
    const referenceId      = `SUB-${safeUserId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const bonusReferenceId = `SUBBONUS-${safeUserId}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    /* ================================
       🔟 WALLET TRANSACTIONS
    ================================= */

    // ── Earn wallet debit ──
    if (earnUse > 0) {
      const uOpen  = userBalance;
      const uClose = Number((userBalance - earnUse).toFixed(2));
      userBalance  = uClose;

      const coOpen  = companyBalance;
      const coClose = Number((companyBalance + earnUse).toFixed(2));
      companyBalance = coClose;

      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount,
          useropeningbalance, userclosingbalance,
          opening_balance, closing_balance,
          reference_id, ip_address, device)
         VALUES (?, 'subscribe', 'debit', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [safeUserId, `Subscription purchase (${safePack})`, earnUse,
         uOpen, uClose, coOpen, coClose, referenceId, safeIp, safeDevice]
      );
    }

    // ── Deposit wallet debit ──
    if (depositUse > 0) {
      const uOpen  = userBalance;
      const uClose = Number((userBalance - depositUse).toFixed(2));
      userBalance  = uClose;

      const coOpen  = companyBalance;
      const coClose = Number((companyBalance + depositUse).toFixed(2));
      companyBalance = coClose;

      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount,
          useropeningbalance, userclosingbalance,
          opening_balance, closing_balance,
          reference_id, ip_address, device)
         VALUES (?, 'subscribe', 'debit', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [safeUserId, `Subscription purchase (${safePack})`, depositUse,
         uOpen, uClose, coOpen, coClose, referenceId, safeIp, safeDevice]
      );
    }

    // ── Bonus credit (first sub only) ──
    if (Number(user.subscription_bonus_given) === 0 && bonus > 0) {
      const uOpen  = bonusRunning;
      const uClose = Number((bonusRunning + bonus).toFixed(2));
      bonusRunning = uClose;

      const coOpen  = companyBalance;
      const coClose = Number((companyBalance - bonus).toFixed(2));
      companyBalance = coClose;

      await conn.query(
        `UPDATE wallets SET bonusamount = bonusamount + ? WHERE user_id = ?`,
        [bonus, safeUserId]
      );

      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount,
          useropeningbalance, userclosingbalance,
          opening_balance, closing_balance, reference_id)
         VALUES (?, 'bonus', 'credit', ?, ?, ?, ?, ?, ?, ?)`,
        [safeUserId, `Subscription bonus (${safePack})`, bonus,
         uOpen, uClose, coOpen, coClose, bonusReferenceId]
      );

      await conn.query(
        `UPDATE users SET subscription_bonus_given = 1 WHERE id = ?`,
        [safeUserId]
      );
    }

    /* ================================
       1️⃣1️⃣ ACTIVATE OR QUEUE
    ================================= */
    if (hasActive) {
      await conn.query(
        `UPDATE users SET
           nextsubscribe          = 1,
           nextsubscribepack      = ?,
           nextsubscribestartdate = ?,
           nextsubscribeenddate   = ?
         WHERE id = ?`,
        [safePack, startDate, endDate, safeUserId]
      );
    } else {
      await conn.query(
        `UPDATE users SET
           subscribe          = 1,
           subscribepack      = ?,
           subscribestartdate = ?,
           subscribeenddate   = ?
         WHERE id = ?`,
        [safePack, startDate, endDate, safeUserId]
      );
    }

    /* ================================
       1️⃣2️⃣ INSERT INTO SUBSCRIPTIONS
    ================================= */
    await conn.query(
      `INSERT INTO subscriptions
       (user_id, package_name, amount, period, status,
        subscription_date, subscription_end, renewal_count,
        auto_renew, discount, final_amount, remark,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, 'success', ?, ?, 0, 0, 0.00, ?, ?, NOW(), NOW())`,
      [safeUserId, safePack, price, period, startDate, endDate, price,
       hasActive ? `Queued subscription (${safePack})` : `New subscription (${safePack})`]
    );

    /* ================================
       1️⃣3️⃣ INCREMENT SUBSCRIPTION COUNT
    ================================= */
    await conn.query(
      `UPDATE users SET subscription_count = subscription_count + 1 WHERE id = ?`,
      [safeUserId]
    );

    await conn.commit();

    return {
      success: true,
      message: hasActive ? "Subscription added to queue" : "Subscription activated",
      startDate,
      endDate,
      deduction: {
        earnUsed:    earnUse,
        depositUsed: depositUse,
        bonusGiven:  Number(user.subscription_bonus_given) === 0 ? bonus : 0,
      },
    };

  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
};

/* ================================
   GET SUBSCRIPTION STATUS
================================= */


export const getSubscriptionStatusService = async (userId) => {
  const [[user]] = await db.query(
    `SELECT
       u.subscribe,
       u.subscribepack,
       u.subscribestartdate,
       u.subscribeenddate,
       s.id AS subscription_id,
       s.amount,
       s.period,
       s.status AS sub_status,
       s.subscription_date,
       s.subscription_end
     FROM users u
     LEFT JOIN subscriptions s
       ON s.user_id = u.id
       AND s.package_name = u.subscribepack
     WHERE u.id = ?
     ORDER BY s.id DESC
     LIMIT 1`,
    [userId]
  );

  const [allPackages] = await db.query(
    `SELECT id, package_name, amount, bonus, duration
     FROM subscription_packages
     WHERE status = 'Active'
     ORDER BY id ASC`
  );

  const formatPlan = (pkg) => {
    const durationValue = pkg.duration === "1M" ? 1 : 3;
    return {
      id:       `plan_${Number(pkg.amount)}_${pkg.duration.toLowerCase()}`,
      name:     pkg.package_name,
      price:    Number(pkg.amount),
      currency: "GBP",
      bonus:    Number(pkg.bonus),
      duration: pkg.duration  
    };
  };

  const meta = {
    timestamp: new Date().toISOString(),
    version:   "v1"
  };

  const isActive =
    user &&
    Number(user.subscribe) === 1 &&
    user.subscribeenddate &&
    new Date(user.subscribeenddate) > new Date();

  if (!isActive) {
    return {
      success: true,
      data: {
        subscription: {
          isActive: false,
          details:  null
        },
        plans: allPackages.map(formatPlan)
      },
      error: null,
      meta
    };
  }

  // Current pack details
  const [[currentPack]] = await db.query(
    `SELECT id, package_name, amount, bonus, duration
     FROM subscription_packages
     WHERE duration = ? AND status = 'Active'`,
    [user.subscribepack]
  );

  // Other packages

  // Other packages — allPackages use cheyyi
  const [otherPackages] = await db.query(
    `SELECT id, package_name, amount, bonus, duration
     FROM subscription_packages
     WHERE status = 'Active'`,  
    []
  );

  return {
    success: true,
    data: {
      subscription: {
        isActive: true,
        details: {
          id:          user.subscription_id,
          name:        currentPack?.package_name,
          price:       Number(user.amount),
          currency:    "GBP",
          bonus:       Number(currentPack?.bonus),
          duration:    currentPack?.duration, 
          billingCycle: user.period,
          status:       user.sub_status,
          startAt:      user.subscription_date,
          endAt:        user.subscription_end
        }
      },
      plans: otherPackages.map((pkg) => ({
        ...formatPlan(pkg),
        isRecommended: true
      }))
    },
    error: null,
    meta
  };
};

/* ================================
   GET ALL PACKAGES
================================= */
export const getAllPackages = async () => {
  const [rows] = await db.execute(
    `SELECT * FROM subscription_packages ORDER BY id ASC`
  );
  return rows;
};

/* ================================
   GET USER SUBSCRIPTIONS HISTORY
================================= */
export const getUserSubscriptionsService = async (userId) => {
  const [rows] = await db.query(
    `SELECT
       id, package_name, amount, period, status,
       subscription_date, subscription_end,
       final_amount, remark, created_at
     FROM subscriptions
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
};