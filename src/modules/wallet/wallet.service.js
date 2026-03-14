import db from "../../config/db.js";

// export const addDepositService = async (
//   userId,
//   amount,
//   paymentIntentId = null
// ) => {

//   if (!amount || amount < 10)
//     throw new Error("Minimum deposit £10");

//   const yearMonth = new Date().toISOString().slice(0, 7);
//   const conn = await db.getConnection();

//   try {
//     await conn.beginTransaction();

//     /* 🧑 GET WALLET LIMIT */
//     const [[wallet]] = await conn.query(
//       `SELECT deposit_limit
//        FROM wallets
//        WHERE user_id = ?
//        FOR UPDATE`,
//       [userId]
//     );

//     if (!wallet) throw new Error("Wallet not found");

//     const MONTHLY_LIMIT = Number(wallet.deposit_limit);

//     /* 📅 MONTHLY TRACKING */
//     const [[row]] = await conn.query(
//       `SELECT total_added
//        FROM monthly_deposits
//        WHERE user_id = ? AND ym = ?
//        FOR UPDATE`,
//       [userId, yearMonth]
//     );

//     const alreadyAdded = row ? Number(row.total_added) : 0;
//     const remaining = MONTHLY_LIMIT - alreadyAdded;

//     if (remaining <= 0)
//       throw new Error(`Monthly limit £${MONTHLY_LIMIT} reached`);

//     if (amount > remaining)
//       throw new Error(`You can add only £${remaining}`);

//     /* 📅 UPDATE MONTHLY TABLE */
//     if (row) {
//       await conn.query(
//         `UPDATE monthly_deposits
//          SET total_added = total_added + ?
//          WHERE user_id = ? AND ym = ?`,
//         [amount, userId, yearMonth]
//       );
//     } else {
//       await conn.query(
//         `INSERT INTO monthly_deposits (user_id, ym, total_added)
//          VALUES (?, ?, ?)`,
//         [userId, yearMonth, amount]
//       );
//     }

//     /* 💰 UPDATE WALLET BALANCE */
//     await conn.query(
//       `UPDATE wallets
//        SET depositwallet = depositwallet + ?
//        WHERE user_id = ?`,
//       [amount, userId]
//     );

//     /* 🧾 INSERT TRANSACTION HISTORY */
//     await conn.query(
//       `INSERT INTO wallet_transactions
//        (user_id, amount, transtype, wallettype, remark, reference_id)
//        VALUES (?, ?, 'credit', 'deposit', 'Stripe deposit', ?)`,
//       [userId, amount, paymentIntentId]
//     );

//     await conn.commit();

//     return {
//       success: true,
//       addedAmount: amount,
//       remainingMonthlyLimit: remaining - amount
//     };

//   } catch (err) {
//     await conn.rollback();
//     throw err;

//   } finally {
//     conn.release();
//   }
// };

export const addDepositServicchandu = async (
  userId,
  amount,
  paymentIntentId = null
) => {

  if (!amount || amount < 10)
    throw new Error("Minimum deposit £10");

  const yearMonth = new Date().toISOString().slice(0, 7);
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    /* 🧑 GET USER DETAILS (for deposite table) */
    const [[user]] = await conn.query(
      `SELECT name, email, mobile
       FROM users
       WHERE id = ?`,
      [userId]
    );

    if (!user) throw new Error("User not found");

    /* 🧑 GET WALLET LIMIT */
    const [[wallet]] = await conn.query(
      `SELECT deposit_limit
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );

    if (!wallet) throw new Error("Wallet not found");

    const MONTHLY_LIMIT = Number(wallet.deposit_limit);

    /* 📅 MONTHLY TRACKING */
    const [[row]] = await conn.query(
      `SELECT total_added
       FROM monthly_deposits
       WHERE user_id = ? AND ym = ?
       FOR UPDATE`,
      [userId, yearMonth]
    );

    const alreadyAdded = row ? Number(row.total_added) : 0;
    const remaining = MONTHLY_LIMIT - alreadyAdded;

    if (remaining <= 0)
      throw new Error(`Monthly limit £${MONTHLY_LIMIT} reached`);

    if (amount > remaining)
      throw new Error(`You can add only £${remaining}`);

    /* 📅 UPDATE MONTHLY TABLE */
    if (row) {
      await conn.query(
        `UPDATE monthly_deposits
         SET total_added = total_added + ?
         WHERE user_id = ? AND ym = ?`,
        [amount, userId, yearMonth]
      );
    } else {
      await conn.query(
        `INSERT INTO monthly_deposits (user_id, ym, total_added)
         VALUES (?, ?, ?)`,
        [userId, yearMonth, amount]
      );
    }

    /* 💰 UPDATE WALLET BALANCE */
    await conn.query(
      `UPDATE wallets
       SET depositwallet = depositwallet + ?
       WHERE user_id = ?`,
      [amount, userId]
    );

    /* 🧾 WALLET TRANSACTION HISTORY */
    await conn.query(
      `INSERT INTO wallet_transactions
       (user_id, amount, transtype, wallettype, remark, reference_id)
       VALUES (?, ?, 'credit', 'deposit', 'Stripe deposit', ?)`,
      [userId, amount, paymentIntentId]
    );

    /* 🧾 INSERT INTO DEPOSITE TABLE 🔥 */
    await conn.query(
      `INSERT INTO deposite
       (createdAt, amount, depositeType, status,
        userId, phone, email, name, transaction_id)
       VALUES (NOW(), ?, 'Stripe', 'success',
               ?, ?, ?, ?, ?)`,
      [
        amount,
        userId,
        user.mobile,
        user.email,
        user.name,
        paymentIntentId
      ]
    );

    await conn.commit();

    return {
      success: true,
      addedAmount: amount,
      remainingMonthlyLimit: remaining - amount
    };

  } catch (err) {
    await conn.rollback();
    throw err;

  } finally {
    conn.release();
  }
};


export const addDepositService = async (userId, amount, paymentIntentId = null) => {

  /* ─── 1️⃣ Input Sanitization ─── */
  if (userId === undefined || userId === null || String(userId).trim() === "") {
    throw new Error("Invalid user");
  }
  const safeUserId = userId;

  const sanitizedAmount = Math.round(Number(amount) * 100) / 100;
  if (isNaN(sanitizedAmount) || sanitizedAmount <= 0) throw new Error("Invalid deposit amount");
  if (sanitizedAmount < 10)   throw new Error("Minimum deposit is £10");
  if (sanitizedAmount > 2000) throw new Error("Maximum single deposit is 2000");

  // Sanitize paymentIntentId — trim and basic format guard
  const safePaymentIntentId = typeof paymentIntentId === "string"
    ? paymentIntentId.trim().slice(0, 200)
    : null;

  if (!safePaymentIntentId && process.env.NODE_ENV === "production") {
    throw new Error("Invalid payment reference");
  }

  const yearMonth = new Date().toISOString().slice(0, 7);  // "2026-03"
  const conn      = await db.getConnection();

  try {
    await conn.beginTransaction();

    /* ─── 2️⃣ Acquire Named Lock — prevents race on company balance ─── */
    const [[lockResult]] = await conn.query(
      `SELECT GET_LOCK('company_balance_lock', 10) AS locked`
    );
    if (!lockResult?.locked) throw new Error("Server busy, please try again");

    /* ─── 3️⃣ Duplicate Payment Check ─── */
    if (safePaymentIntentId) {
      const [[existing]] = await conn.query(
        `SELECT id FROM wallet_transactions
         WHERE reference_id = ?
         LIMIT 1`,
        [safePaymentIntentId]
      );
      if (existing) throw new Error("Payment already processed");
    }

    /* ─── 4️⃣ Get User Details ─── */
    const [[user]] = await conn.query(
      `SELECT name, email, mobile
       FROM users
       WHERE id = ?`,
      [safeUserId]
    );
    if (!user) throw new Error("User not found");

    /* ─── 5️⃣ Get Wallet — FOR UPDATE locks row ─── */
    const [[wallet]] = await conn.query(
      `SELECT deposit_limit, depositwallet, earnwallet, bonusamount
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [safeUserId]
    );
    if (!wallet) throw new Error("Wallet not found");

    const MONTHLY_LIMIT  = Number(wallet.deposit_limit);
    const depositBalance = Number(wallet.depositwallet  || 0);
    const earnBalance    = Number(wallet.earnwallet      || 0);
    const bonusBalance   = Number(wallet.bonusamount     || 0);

    // ✅ True total user balance across all wallets — consistent with all other services
    const userOpening = Number((depositBalance + earnBalance + bonusBalance).toFixed(2));
    const userClosing = Number((userOpening + sanitizedAmount).toFixed(2));  // deposit credit → total goes up

    /* ─── 6️⃣ Monthly Limit Check ─── */
    const [[monthRow]] = await conn.query(
      `SELECT total_added
       FROM monthly_deposits
       WHERE user_id = ? AND ym = ?
       FOR UPDATE`,
      [safeUserId, yearMonth]
    );

    const alreadyAdded = monthRow ? Number(monthRow.total_added) : 0;
    const remaining    = MONTHLY_LIMIT - alreadyAdded;

    if (remaining <= 0) {
      throw new Error(`Monthly deposit limit of £${MONTHLY_LIMIT} reached`);
    }
    if (sanitizedAmount > remaining) {
      throw new Error(
        `Only £${remaining} remaining in your monthly limit. ` +
        `Already deposited £${alreadyAdded} this month.`
      );
    }

    /* ─── 7️⃣ Get Company Last Balance — FOR UPDATE prevents stale read ─── */
    const [[companyLast]] = await conn.query(
      `SELECT closing_balance
       FROM wallet_transactions
       WHERE closing_balance != 0
       ORDER BY id DESC
       LIMIT 1
       FOR UPDATE`
    );
    const companyOpening = Number(companyLast?.closing_balance || 0);
    const companyClosing = Number((companyOpening + sanitizedAmount).toFixed(2));  // company receives deposit ↑

    /* ─── 8️⃣ Update Monthly Deposits ─── */
    if (monthRow) {
      await conn.query(
        `UPDATE monthly_deposits
         SET total_added = total_added + ?
         WHERE user_id = ? AND ym = ?`,
        [sanitizedAmount, safeUserId, yearMonth]
      );
    } else {
      await conn.query(
        `INSERT INTO monthly_deposits (user_id, ym, total_added)
         VALUES (?, ?, ?)`,
        [safeUserId, yearMonth, sanitizedAmount]
      );
    }

    /* ─── 9️⃣ Update Wallet Balance ─── */
    await conn.query(
      `UPDATE wallets
       SET depositwallet  = depositwallet  + ?,
           total_deposits = total_deposits + ?
       WHERE user_id = ?`,
      [sanitizedAmount, sanitizedAmount, safeUserId]
    );

    /* ─── 🔟 Insert Wallet Transaction ─── */
    await conn.query(
      `INSERT INTO wallet_transactions
       (user_id, wallettype, transtype, remark,
        amount,
        useropeningbalance, userclosingbalance,
        opening_balance,    closing_balance,
        reference_id)
       VALUES (?, 'deposit', 'credit', 'Stripe deposit',
        ?,
        ?, ?,
        ?, ?,
        ?)`,
      [
        safeUserId,
        sanitizedAmount,
        userOpening,    userClosing,      // ✅ earn + deposit + bonus total
        companyOpening, companyClosing,   // company side
        safePaymentIntentId,
      ]
    );

    /* ─── 1️⃣1️⃣ Insert into Deposit Table ─── */
    await conn.query(
      `INSERT INTO deposite
       (createdAt, amount, depositeType, status,
        userId, phone, email, name, transaction_id)
       VALUES (NOW(), ?, 'Stripe', 'success',
               ?, ?, ?, ?, ?)`,
      [
        sanitizedAmount,
        safeUserId,
        user.mobile,
        user.email,
        user.name,
        safePaymentIntentId,
      ]
    );

    await conn.commit();

    /* ─── Release Lock after commit ─── */
    // ✅ Released on same conn BEFORE conn.release() — conn still valid here
    await conn.query(`SELECT RELEASE_LOCK('company_balance_lock')`);

    return {
      success:               true,
      addedAmount:           sanitizedAmount,
      newBalance:            userClosing,           // ✅ true total balance after deposit
      remainingMonthlyLimit: Math.max(0, remaining - sanitizedAmount),
    };

  } catch (err) {
    await conn.rollback();

    // ✅ Release lock on same conn — still valid even after rollback
    try {
      await conn.query(`SELECT RELEASE_LOCK('company_balance_lock')`);
    } catch (_) {
      // ignore — lock will auto-release when session ends
    }

    if (process.env.NODE_ENV !== "production") {
      console.error(
        `[addDepositService] userId=${safeUserId} amount=${sanitizedAmount} error=${err.message}`
      );
    }

    throw err;

  } finally {
    // ✅ conn.release() always last — after lock released, after rollback/commit
    conn.release();
  }
};

export const getMyWalletService = async (userId) => {

  if (userId === undefined || userId === null || String(userId).trim() === "") {
    throw new Error("Invalid user");
  }

  const [[wallet]] = await db.query(
    `SELECT depositwallet, earnwallet, bonusamount
     FROM wallets
     WHERE user_id = ?`,
    [userId]
  );

  if (!wallet) throw new Error("Wallet not found");

  const depositWallet  = Number(wallet.depositwallet || 0);
  const earnWallet     = Number(wallet.earnwallet     || 0);
  const bonusWallet    = Number(wallet.bonusamount    || 0);

  return {
    depositWallet,
    earnWallet,
    bonusWallet,
    totalBalance: Number((depositWallet + earnWallet + bonusWallet).toFixed(2)),
  };
};



export const getMyTransactionsService = async (userId) => {
  const [rows] = await db.query(
    `SELECT
        id,
        wallettype,
        transtype,
        amount,
        remark,
        reference_id,
        created_at
     FROM wallet_transactions
     WHERE user_id = ?
     ORDER BY id DESC`,
    [userId]
  );

  return rows.map(txn => ({
    id: txn.id,
    walletType: txn.wallettype,      // deposit / withdraw / bonus
    transactionType: txn.transtype,  // credit / debit
    amount: Number(txn.amount),
    remark: txn.remark,
    referenceId: txn.reference_id,
    date: txn.created_at
  }));
};


// 1 FIRST define helper
export const createWalletTransaction = async ({
  conn,
  userId,
  wallettype,
  transtype,
  amount,
  remark = null,
  referenceId,
  transactionHash = null,
  ip = null,
  device = null
}) => {
  const [[last]] = await conn.query(
    `SELECT closing_balance
     FROM wallet_transactions
     ORDER BY id DESC
     LIMIT 1
     FOR UPDATE`
  );

  const openingBalance = last ? Number(last.closing_balance) : 0;

  const closingBalance =
    transtype === "credit"
      ? openingBalance + amount
      : openingBalance - amount;

  await conn.query(
    `INSERT INTO wallet_transactions
     (user_id, wallettype, transtype, remark, amount,
      opening_balance, closing_balance,
      reference_id, transaction_hash,
      ip_address, device)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      wallettype,
      transtype,
      remark,
      amount,
      openingBalance,
      closingBalance,
      referenceId,
      transactionHash,
      ip,
      device
    ]
  );
};

export const deleteTransactionsByUserCodeService = async (userid) => {

  //  Convert userid → id
  const [[user]] = await db.query(
    `SELECT id FROM users WHERE userid = ?`,
    [userid]
  );

  if (!user) throw new Error("User not found");

  //  Delete using numeric ID
  const [result] = await db.query(
    `DELETE FROM wallet_transactions
     WHERE user_id = ?`,
    [user.id]
  );

  return result.affectedRows;
};

//my analytics..................................................................


// export const getMyAnalyticsService = async (userId) => {

//   /* ================= FINANCIAL SUMMARY ================= */

//   const [[financial]] = await db.query(
//     `SELECT
//       SUM(CASE WHEN wallettype='deposit' AND transtype='credit' THEN amount ELSE 0 END) AS deposits,
//       SUM(CASE WHEN wallettype='withdrawal' AND transtype='debit' THEN amount ELSE 0 END) AS withdrawals,
//       SUM(CASE WHEN wallettype IN ('winning','refund') AND transtype='credit' THEN amount ELSE 0 END) AS credits
//      FROM wallet_transactions
//      WHERE user_id = ?`,
//     [userId]
//   );

//   /* ================= CONTEST ENTRIES ================= */

//   const [entries] = await db.query(
//     `SELECT 
//         ce.entry_fee,
//         c.match_id,
//         ce.joined_at
//      FROM contest_entries ce
//      JOIN contest c ON ce.contest_id = c.id
//      WHERE ce.user_id = ?`,
//     [userId]
//   );

//   /* ================= WALLET INFO ================= */

//   const [[wallet]] = await db.query(
//     `SELECT 
//         depositwallet,
//         earnwallet,
//         bonusamount,
//         deposit_limit,
//         total_deposits
//      FROM wallets
//      WHERE user_id = ?`,
//     [userId]
//   );

//   /* ================= ENTRY FEES ================= */

//   const entryFees = entries.reduce(
//     (sum, e) => sum + Number(e.entry_fee || 0),
//     0
//   );

//   /* ================= WALLET BALANCE ================= */

//   const walletBalance =
//     Number(wallet?.depositwallet || 0) +
//     Number(wallet?.earnwallet || 0) +
//     Number(wallet?.bonusamount || 0);

//   /* ================= FINANCIAL CALCULATIONS ================= */

//   const deposits = Number(financial?.deposits || 0);
//   const withdrawals = Number(financial?.withdrawals || 0);
//   const credits = Number(financial?.credits || 0);

//   const netDifference = credits - deposits;

//   /* ================= ACTIVITY METRICS ================= */

//   const contestsJoined = entries.length;

//   const matchesPlayed = new Set(
//     entries.map(e => e.match_id)
//   ).size;

//   const activeDays = new Set(
//     entries.map(e =>
//       new Date(e.joined_at).toDateString()
//     )
//   ).size;

//   const avgContests =
//     matchesPlayed === 0
//       ? 0
//       : Number((contestsJoined / matchesPlayed).toFixed(2));

//   /* ================= LIMITS ================= */

//   const monthlyLimit = Number(wallet?.deposit_limit || 0);
//   const usedThisMonth = Number(wallet?.total_deposits || 0);

//   const remainingLimit = Math.max(
//     monthlyLimit - usedThisMonth,
//     0
//   );

//   /* ================= RESPONSE ================= */

//   return {
//     financial: {
//       money_deposited: deposits,
//       money_withdrawn: withdrawals,
//       wallet_balance: walletBalance,
//       contest_entry_fees: entryFees,
//       credits_received: credits,
//       net_difference: netDifference
//     },

//     activity: {
//       contests_joined: contestsJoined,
//       matches_played: matchesPlayed,
//       avg_contests_per_match: avgContests,
//       active_days: activeDays
//     },

//     limits: {
//       monthly_deposit_limit: monthlyLimit,
//       used_this_month: usedThisMonth,
//       remaining: remainingLimit
//     }
//   };
// };



export const getMyAnalyticsService = async (userId, month = null, year = null) => {

  /* ================= WALLET TRANSACTION FILTER ================= */

  let conditions = ["user_id = ?"];
  let params = [userId];

  if (month && year) {
    conditions.push("MONTH(created_at) = ?");
    conditions.push("YEAR(created_at) = ?");
    params.push(month, year);
  }  

  const whereClause = conditions.join(" AND ");

  /* ================= FINANCIAL SUMMARY ================= */

  const [[financial]] = await db.query(
    `SELECT
      SUM(CASE WHEN wallettype='deposit' AND transtype='credit' THEN amount ELSE 0 END) AS deposits,
      SUM(CASE WHEN wallettype='withdrawal' AND transtype='debit' THEN amount ELSE 0 END) AS withdrawals,
      SUM(CASE WHEN wallettype IN ('winning','refund') AND transtype='credit' THEN amount ELSE 0 END) AS credits
     FROM wallet_transactions
     WHERE ${whereClause}`,
    params
  );

  /* ================= CONTEST ENTRY FILTER ================= */

  let entryConditions = ["ce.user_id = ?"];
  let entryParams = [userId];

  if (month && year) {
    entryConditions.push("MONTH(ce.joined_at) = ?");
    entryConditions.push("YEAR(ce.joined_at) = ?");
    entryParams.push(month, year);
  }

  const entryWhere = entryConditions.join(" AND ");

  const [entries] = await db.query(
    `SELECT 
        ce.entry_fee,
        c.match_id,
        ce.joined_at
     FROM contest_entries ce
     JOIN contest c ON ce.contest_id = c.id
     WHERE ${entryWhere}`,
    entryParams
  );

  /* ================= WALLET INFO ================= */

  const [[wallet]] = await db.query(
    `SELECT 
        depositwallet,
        earnwallet,
        bonusamount,
        deposit_limit,
        total_deposits
     FROM wallets
     WHERE user_id = ?`,
    [userId]
  );

  /* ================= ENTRY FEES ================= */

  const entryFees = entries.reduce(
    (sum, e) => sum + Number(e.entry_fee || 0),
    0
  );

  /* ================= WALLET BALANCE ================= */

  const walletBalance =
    Number(wallet?.depositwallet || 0) +
    Number(wallet?.earnwallet || 0) +
    Number(wallet?.bonusamount || 0);

  /* ================= FINANCIAL VALUES ================= */

  const deposits = Number(financial?.deposits || 0);
  const withdrawals = Number(financial?.withdrawals || 0);
  const credits = Number(financial?.credits || 0);

  /* ================= ACTIVITY METRICS ================= */

  const contestsJoined = entries.length;

  const matchesPlayed = new Set(
    entries.map(e => e.match_id)
  ).size;

  const activeDays = new Set(
    entries.map(e =>
      new Date(e.joined_at).toDateString()
    )
  ).size;

  const avgContests =
    matchesPlayed === 0
      ? 0
      : Number((contestsJoined / matchesPlayed).toFixed(2));

  /* ================= LIMITS ================= */

  const monthlyLimit = Number(wallet?.deposit_limit || 0);
  const usedThisMonth = Number(wallet?.total_deposits || 0);

  const remainingLimit = Math.max(
    monthlyLimit - usedThisMonth,
    0
  );

  /* ================= RESPONSE ================= */

  return {
    financial: {
      money_deposited: deposits,
      money_withdrawn: withdrawals,
      wallet_balance: walletBalance,
      contest_entry_fees: entryFees,
      credits_received: credits
    },

    activity: {
      contests_joined: contestsJoined,
      matches_played: matchesPlayed,
      avg_contests_per_match: avgContests,
      active_days: activeDays
    },

    limits: {
      monthly_deposit_limit: monthlyLimit,
      used_this_month: usedThisMonth,
      remaining: remainingLimit
    }
  };
};