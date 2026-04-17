import db from "../../config/db.js";

// ─────────────────────────────────────────────────────────────────────────────
// ADD DEPOSIT
// ─────────────────────────────────────────────────────────────────────────────

export const addDepositService = async (userId, amount, paymentIntentId = null) => {

  if (userId === undefined || userId === null || String(userId).trim() === "")
    throw new Error("Invalid user");

  const sanitizedAmount = Math.round(Number(amount) * 100) / 100;
  if (isNaN(sanitizedAmount) || sanitizedAmount <= 0) throw new Error("Invalid deposit amount");
  if (sanitizedAmount < 10)   throw new Error("Minimum deposit is £10");
  if (sanitizedAmount > 2000) throw new Error("Maximum single deposit is £2000");

  const safePaymentIntentId = typeof paymentIntentId === "string"
    ? paymentIntentId.trim().slice(0, 200)
    : null;

  if (!safePaymentIntentId && process.env.NODE_ENV === "production")
    throw new Error("Invalid payment reference");

  const yearMonth = new Date().toISOString().slice(0, 7);
  const conn      = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [[lockResult]] = await conn.query(
      `SELECT GET_LOCK('company_balance_lock', 10) AS locked`
    );
    if (!lockResult?.locked) throw new Error("Server busy, please try again");

    if (safePaymentIntentId) {
      const [[existing]] = await conn.query(
        `SELECT id FROM wallet_transactions WHERE reference_id = ? LIMIT 1`,
        [safePaymentIntentId]
      );
      if (existing) throw new Error("Payment already processed");
    }

    const [[user]] = await conn.query(
      `SELECT name, email, mobile FROM users WHERE id = ?`,
      [userId]
    );
    if (!user) throw new Error("User not found");

    const [[wallet]] = await conn.query(
      `SELECT deposit_limit, depositwallet, earnwallet, bonusamount
       FROM wallets WHERE user_id = ? FOR UPDATE`,
      [userId]
    );
    if (!wallet) throw new Error("Wallet not found");

    const MONTHLY_LIMIT  = Number(wallet.deposit_limit);
    const depositBalance = Number(wallet.depositwallet || 0);
    const earnBalance    = Number(wallet.earnwallet    || 0);
    const bonusBalance   = Number(wallet.bonusamount   || 0);

    const userOpening = Number((depositBalance + earnBalance + bonusBalance).toFixed(2));
    const userClosing = Number((userOpening + sanitizedAmount).toFixed(2));

    const [[monthRow]] = await conn.query(
      `SELECT total_added FROM monthly_deposits
       WHERE user_id = ? AND ym = ? FOR UPDATE`,
      [userId, yearMonth]
    );

    const alreadyAdded = monthRow ? Number(monthRow.total_added) : 0;
    const remaining    = MONTHLY_LIMIT - alreadyAdded;

    if (remaining <= 0)
      throw new Error(`Monthly deposit limit of £${MONTHLY_LIMIT} reached`);
    if (sanitizedAmount > remaining)
      throw new Error(`Only £${remaining} remaining in your monthly limit. Already deposited £${alreadyAdded} this month.`);

    const [[companyLast]] = await conn.query(
      `SELECT closing_balance FROM wallet_transactions
       WHERE closing_balance != 0 ORDER BY id DESC LIMIT 1 FOR UPDATE`
    );
    const companyOpening = Number(companyLast?.closing_balance || 0);
    const companyClosing = Number((companyOpening + sanitizedAmount).toFixed(2));

    if (monthRow) {
      await conn.query(
        `UPDATE monthly_deposits SET total_added = total_added + ?
         WHERE user_id = ? AND ym = ?`,
        [sanitizedAmount, userId, yearMonth]
      );
    } else {
      await conn.query(
        `INSERT INTO monthly_deposits (user_id, ym, total_added) VALUES (?, ?, ?)`,
        [userId, yearMonth, sanitizedAmount]
      );
    }

    await conn.query(
      `UPDATE wallets
       SET depositwallet  = depositwallet  + ?,
           total_deposits = total_deposits + ?
       WHERE user_id = ?`,
      [sanitizedAmount, sanitizedAmount, userId]
    );

    await conn.query(
      `INSERT INTO wallet_transactions
       (user_id, wallettype, transtype, remark, amount,
        useropeningbalance, userclosingbalance,
        opening_balance, closing_balance, reference_id)
       VALUES (?, 'deposit', 'credit', 'Stripe deposit', ?, ?, ?, ?, ?, ?)`,
      [userId, sanitizedAmount, userOpening, userClosing, companyOpening, companyClosing, safePaymentIntentId]
    );

    await conn.query(
      `INSERT INTO deposite
       (createdAt, amount, depositeType, status, userId, phone, email, name, transaction_id)
       VALUES (NOW(), ?, 'Stripe', 'success', ?, ?, ?, ?, ?)`,
      [sanitizedAmount, userId, user.mobile, user.email, user.name, safePaymentIntentId]
    );

    await conn.commit();
    await conn.query(`SELECT RELEASE_LOCK('company_balance_lock')`);

    return {
      success:               true,
      addedAmount:           sanitizedAmount,
      newBalance:            userClosing,
      remainingMonthlyLimit: Math.max(0, remaining - sanitizedAmount),
    };

  } catch (err) {
    await conn.rollback();
    try { await conn.query(`SELECT RELEASE_LOCK('company_balance_lock')`); } catch (_) {}
    if (process.env.NODE_ENV !== "production")
      console.error(`[addDepositService] userId=${userId} amount=${sanitizedAmount} error=${err.message}`);
    throw err;
  } finally {
    conn.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MY WALLET
// ─────────────────────────────────────────────────────────────────────────────

export const getMyWalletService = async (userId) => {
  if (!userId) throw new Error("Invalid user");

  const [[wallet]] = await db.query(
    `SELECT depositwallet, earnwallet, bonusamount FROM wallets WHERE user_id = ?`,
    [userId]
  );
  if (!wallet) throw new Error("Wallet not found");

  const depositWallet = Number(wallet.depositwallet || 0);
  const earnWallet    = Number(wallet.earnwallet    || 0);
  const bonusWallet   = Number(wallet.bonusamount   || 0);

  return {
    depositWallet,
    earnWallet,
    bonusWallet,
    totalBalance: Number((depositWallet + earnWallet + bonusWallet).toFixed(2)),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MY TRANSACTIONS
// Fix: useropeningbalance / userclosingbalance also returned
// ─────────────────────────────────────────────────────────────────────────────

export const getMyTransactionsService = async (userId) => {
  if (!userId) throw new Error("Invalid user");

  const [rows] = await db.query(
    `SELECT
       id,
       wallettype,
       transtype,
       amount,
       remark,
       reference_id,
       useropeningbalance,
       userclosingbalance,
       created_at
     FROM wallet_transactions
     WHERE user_id = ?
     ORDER BY id DESC`,
    [userId]
  );

  return rows.map(txn => ({
    id:              txn.id,
    walletType:      txn.wallettype,
    transactionType: txn.transtype,
    amount:          Number(txn.amount),
    remark:          txn.remark         || null,
    referenceId:     txn.reference_id   || null,
    openingBalance:  Number(txn.useropeningbalance || 0),
    closingBalance:  Number(txn.userclosingbalance || 0),
    date:            txn.created_at,
  }));
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MY TRANSACTIONS BY YEAR (PDF export)
// ─────────────────────────────────────────────────────────────────────────────

export const getMyTransactionsServiceYear = async (userId, year) => {
  const [[user]] = await db.query(
    `SELECT created_at FROM users WHERE id = ?`,
    [userId]
  );
  if (!user) throw new Error("User not found");

  const joinYear  = new Date(user.created_at).getFullYear();
  const startDate = Number(year) === joinYear
    ? user.created_at
    : `${year}-01-01 00:00:00`;
  const endDate   = `${year}-12-31 23:59:59`;

  const [rows] = await db.query(
    `SELECT
       id, wallettype, transtype, amount, remark, reference_id, created_at
     FROM wallet_transactions
     WHERE user_id = ? AND created_at BETWEEN ? AND ?
     ORDER BY created_at DESC`,
    [userId, startDate, endDate]
  );

  if (!rows.length) return { message: `No transactions found for ${year}`, data: [] };

  return {
    data: rows.map(txn => ({
      id:              txn.id,
      walletType:      txn.wallettype,
      transactionType: txn.transtype,
      amount:          Number(txn.amount),
      remark:          txn.remark       || null,
      referenceId:     txn.reference_id || null,
      date:            txn.created_at,
    })),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE WALLET TRANSACTION (helper used by other services)
// ─────────────────────────────────────────────────────────────────────────────

export const createWalletTransaction = async ({
  conn, userId, wallettype, transtype, amount,
  remark = null, referenceId, transactionHash = null, ip = null, device = null
}) => {
  const [[last]] = await conn.query(
    `SELECT closing_balance FROM wallet_transactions ORDER BY id DESC LIMIT 1 FOR UPDATE`
  );

  const openingBalance = last ? Number(last.closing_balance) : 0;
  const closingBalance = transtype === "credit"
    ? openingBalance + amount
    : openingBalance - amount;

  await conn.query(
    `INSERT INTO wallet_transactions
     (user_id, wallettype, transtype, remark, amount,
      opening_balance, closing_balance, reference_id, transaction_hash, ip_address, device)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, wallettype, transtype, remark, amount,
     openingBalance, closingBalance, referenceId, transactionHash, ip, device]
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE TRANSACTIONS BY USER (admin/debug)
// ─────────────────────────────────────────────────────────────────────────────

export const deleteTransactionsByUserCodeService = async (userid) => {
  const [[user]] = await db.query(
    `SELECT id FROM users WHERE userid = ?`,
    [userid]
  );
  if (!user) throw new Error("User not found");

  const [result] = await db.query(
    `DELETE FROM wallet_transactions WHERE user_id = ?`,
    [user.id]
  );
  return result.affectedRows;
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MY ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export const getMyAnalyticsService = async (userId, month = null, year = null) => {
  const now          = new Date();
  const currentYear  = now.getFullYear();

  // ── Wallet financial data ──
  let conditions = ["user_id = ?"];
  let params     = [userId];

  if (month !== null && year === null) {
    conditions.push("MONTH(created_at) = ?", "YEAR(created_at) = ?");
    params.push(month, currentYear);
  } else if (month === null && year !== null) {
    conditions.push("YEAR(created_at) = ?");
    params.push(year);
  } else if (month !== null && year !== null) {
    conditions.push("MONTH(created_at) = ?", "YEAR(created_at) = ?");
    params.push(month, year);
  }

  const whereClause = conditions.join(" AND ");

  const [[financial]] = await db.query(
    `SELECT
       SUM(CASE WHEN wallettype = 'deposit'    AND transtype = 'credit' THEN amount ELSE 0 END) AS deposits,
       SUM(CASE WHEN wallettype = 'withdrawal' AND transtype = 'debit'  THEN amount ELSE 0 END) AS withdrawals,
       SUM(CASE WHEN wallettype = 'winning'    AND transtype = 'credit' THEN amount ELSE 0 END) AS winnings,
       SUM(CASE WHEN wallettype = 'refund'     AND transtype = 'credit' THEN amount ELSE 0 END) AS refunds,
       SUM(CASE WHEN wallettype = 'bonus'      AND transtype = 'credit' THEN amount ELSE 0 END) AS bonus_received
     FROM wallet_transactions
     WHERE ${whereClause}`,
    params
  );

  // ── Contest entries ──
  let entryConditions = ["ce.user_id = ?"];
  let entryParams     = [userId];

  if (month !== null && year === null) {
    entryConditions.push("MONTH(ce.joined_at) = ?", "YEAR(ce.joined_at) = ?");
    entryParams.push(month, currentYear);
  } else if (month === null && year !== null) {
    entryConditions.push("YEAR(ce.joined_at) = ?");
    entryParams.push(year);
  } else if (month !== null && year !== null) {
    entryConditions.push("MONTH(ce.joined_at) = ?", "YEAR(ce.joined_at) = ?");
    entryParams.push(month, year);
  }

  const entryWhere = entryConditions.join(" AND ");

  const [entries] = await db.query(
    `SELECT
       ce.contest_id, ce.entry_fee, ce.joined_at, ce.status, c.match_id
     FROM contest_entries ce
     JOIN contest c ON ce.contest_id = c.id
     WHERE ${entryWhere}
     ORDER BY ce.joined_at DESC`,
    entryParams
  );

  // ── Active days ──
  let walletDateParams  = [userId];
  let walletDateFilters = "";

  if (month !== null) {
    walletDateFilters += " AND MONTH(created_at) = ?";
    walletDateParams.push(month);
  }
  if (year !== null) {
    walletDateFilters += " AND YEAR(created_at) = ?";
    walletDateParams.push(year);
  } else if (month !== null) {
    walletDateFilters += " AND YEAR(created_at) = ?";
    walletDateParams.push(currentYear);
  }

  const [walletDates] = await db.query(
    `SELECT DISTINCT DATE(created_at) AS activity_date
     FROM wallet_transactions
     WHERE user_id = ? AND wallettype IN ('deposit', 'withdrawal') ${walletDateFilters}`,
    walletDateParams
  );

  // ── Wallet + limits ──
  const [[wallet]] = await db.query(
    `SELECT depositwallet, earnwallet, bonusamount, deposit_limit, total_deposits
     FROM wallets WHERE user_id = ?`,
    [userId]
  );

  const [[userRow]] = await db.query(
    `SELECT created_at AS member_since FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
 // ── Last activity timestamp ──         
  const [[lastActivity]] = await db.query(
    `SELECT MAX(t) AS last_activity FROM (
       SELECT created_at AS t FROM wallet_transactions WHERE user_id = ?
       UNION ALL
       SELECT joined_at  AS t FROM contest_entries       WHERE user_id = ?
     ) x`,
    [userId, userId]
  );
  // ── Calculations ──
  const deposits     = Number(financial?.deposits      || 0);
  const withdrawals  = Number(financial?.withdrawals   || 0);
  const winnings     = Number(financial?.winnings      || 0);
  const refunds      = Number(financial?.refunds       || 0);
  const bonusRcvd    = Number(financial?.bonus_received || 0);

  const walletBalance =
    Number(wallet?.depositwallet || 0) +
    Number(wallet?.earnwallet    || 0) +
    Number(wallet?.bonusamount   || 0);

  const entryFees         = entries.reduce((s, e) => s + Number(e.entry_fee || 0), 0);
  const contestsJoined    = new Set(entries.map(e => e.contest_id)).size;
  const contestsCompleted = entries.filter(e => ["settled", "completed"].includes(e.status)).length;
  const matchesPlayed     = new Set(entries.map(e => e.match_id)).size;
  const avgContests       = matchesPlayed === 0 ? 0 : Number((contestsJoined / matchesPlayed).toFixed(2));
  const lastContestPlayed = entries.length > 0 ? entries[0].joined_at : null;

  const entryDateStrings  = entries.map(e => new Date(e.joined_at).toDateString());
  const walletDateStrings = walletDates.map(r => new Date(r.activity_date).toDateString());
  const activeDays        = new Set([...entryDateStrings, ...walletDateStrings]).size;

  const monthlyLimit     = Number(wallet?.deposit_limit  || 0);
  const usedThisMonth    = Number(wallet?.total_deposits || 0);
  const remainingLimit   = Math.max(monthlyLimit - usedThisMonth, 0);
  const limitUsedPercent = monthlyLimit > 0
    ? Number(((usedThisMonth / monthlyLimit) * 100).toFixed(1))
    : 0;

  return {
    financial: {
      money_deposited:    deposits,
      money_withdrawn:    withdrawals,
      winnings,
      refunds,
      bonus_received:     bonusRcvd,
      wallet_balance:     walletBalance,
      contest_entry_fees: entryFees,
    },
    activity: {
      contests_joined:        contestsJoined,
      contests_completed:     contestsCompleted,
      matches_played:         matchesPlayed,
      avg_contests_per_match: avgContests,
      active_days:            activeDays,
      last_contest_played:    lastContestPlayed,
    },
    account: {
      member_since: userRow?.member_since || null,
      active_days:  activeDays,
      last_activity_date: lastActivity?.last_activity || null
    },
    limits: {
      monthly_deposit_limit: monthlyLimit,
      used_this_month:       usedThisMonth,
      remaining:             remainingLimit,
      used_percent:          limitUsedPercent,
    },
  };
};