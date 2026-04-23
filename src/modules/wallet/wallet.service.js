import db from "../../config/db.js";


import { sendMail } from "../../utils/send.mail.js"
import { logActivity } from "../../utils/activity.logger.js";

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

    logActivity({
      userId,
      type:        "deposit",
      title:       "Deposit Successful",
      description: `₹${sanitizedAmount} deposited via Stripe`,
      amount:      sanitizedAmount,
      icon:        "wallet",
    });

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


export const getMyActivityService = async (userId, { page, limit, type }) => {
  const offset = (page - 1) * limit;

  let allActivities = [];

  // ── 1. Wallet Transactions ──
  if (!type || type === "wallet") {
    const [rows] = await db.query(
      `SELECT
         wt.id,
         wt.wallettype,
         wt.transtype,
         wt.remark,
         wt.amount,
         wt.useropeningbalance,
         wt.userclosingbalance,
         wt.created_at
       FROM wallet_transactions wt
       WHERE wt.user_id = ?
       ORDER BY wt.created_at DESC`,
      [userId]
    );

    rows.forEach(r => {
      allActivities.push({
        activityId:     `wallet_${r.id}`,
        type:           "wallet",
        subType:        r.transtype,
        walletType:     r.wallettype,
        title:          getWalletTitle(r.transtype, r.wallettype),
        description:    r.remark || null,
        amount:         Number(r.amount) || 0,
        openingBalance: Number(r.useropeningbalance) || 0,
        closingBalance: Number(r.userclosingbalance) || 0,
        icon:           getWalletIcon(r.transtype, r.wallettype),
        createdAt:      r.created_at,
      });
    });
  }

  // ── 2. Deposit History ──
  if (!type || type === "deposit") {
    const [rows] = await db.query(
      `SELECT
         d.transaction_id,
         d.amount,
         d.depositeType,
         d.status,
         d.createdAt
       FROM deposite d
       WHERE d.userId = ?
       ORDER BY d.createdAt DESC`,
      [userId]
    );

    rows.forEach(r => {
      allActivities.push({
        activityId:   `deposit_${r.transaction_id || r.createdAt}`,
        type:         "deposit",
        subType:      r.status?.toLowerCase(),
        title:        getDepositTitle(r.status),
        description:  r.depositeType || null,
        amount:       Number(r.amount) || 0,
        status:       r.status        || null,
        icon:         "💰",
        createdAt:    r.createdAt,
      });
    });
  }

  // ── 3. Withdrawal History ──
  
if (!type || type === "withdrawal") {
  const [rows] = await db.query(
    `SELECT
       w.id,
       w.amount,
       w.transaction_id,
       w.status,
       w.snapshot_opening,
       w.snapshot_closing,
       w.created_at,
       w.processed_at,
       wa.status      AS approval_status,
       wa.remarks     AS approval_remarks
     FROM withdraws w
     LEFT JOIN withdraw_approvals wa ON wa.withdrawal_id = w.id
     WHERE w.user_id = ?
     ORDER BY w.created_at DESC`,
    [userId]
  );

  rows.forEach(r => {
    allActivities.push({
      activityId:      `withdraw_${r.id}`,
      type:            "withdrawal",
      subType:         r.status?.toLowerCase(),
      title:           getWithdrawTitle(r.status),
      description:     r.approval_remarks || null,
      amount:          Number(r.amount)   || 0,
      status:          r.status           || null,
      approvalStatus:  r.approval_status  || null,
      processedAt:     r.processed_at     || null,
      icon:            "🏦",
      createdAt:       r.created_at,
    });
  });
}
  // ── 4. Contest History ──
  if (!type || type === "contest") {
    const [rows] = await db.query(
      `SELECT
         ce.id,
         ce.contest_id,
         ce.entry_fee,
         ce.urank,
         ce.winning_amount,
         ce.status,
         ce.joined_at,
         c.contest_type,
         c.prize_pool,
         c.status        AS contest_status,
         m.id            AS match_id,
         m.matchdate,
         m.status        AS match_status,
         ht.short_name   AS home_team_short,
         at.short_name   AS away_team_short,
         ut.team_name
       FROM contest_entries ce
       JOIN contest c   ON c.id  = ce.contest_id
       JOIN matches m   ON m.id  = c.match_id
       JOIN teams ht    ON ht.id = m.home_team_id
       JOIN teams at    ON at.id = m.away_team_id
       LEFT JOIN user_teams ut ON ut.id = ce.user_team_id
       WHERE ce.user_id = ?
       ORDER BY ce.joined_at DESC`,
      [userId]
    );

    rows.forEach(r => {
      allActivities.push({
        activityId:    `contest_${r.id}`,
        type:          "contest",
        subType:       r.contest_status === "COMPLETED" ? "completed" : "joined",
        title:         `${r.home_team_short} vs ${r.away_team_short} — ${r.contest_type || "Contest"}`,
        description:   r.team_name ? `Team: ${r.team_name}` : null,
        matchId:       r.match_id,
        contestId:     r.contest_id,
        entryFee:      Number(r.entry_fee)      || 0,
        prizePool:     Number(r.prize_pool)      || 0,
        rank:          r.urank                   || null,
        winningAmount: Number(r.winning_amount)  || 0,
        contestStatus: r.contest_status          || null,
        matchStatus:   r.match_status            || null,
        matchDate:     r.matchdate               || null,
        icon:          r.winning_amount > 0 ? "🏆" : "🎮",
        createdAt:     r.joined_at,
      });
    });
  }

  // ── 5. KYC History ──
  if (!type || type === "kyc") {
    const [rows] = await db.query(
      `SELECT
         ka.id,
         ka.status,
         ka.remarks,
         ka.created_at
       FROM kyc_approvals ka
       WHERE ka.user_id = ?
       ORDER BY ka.created_at DESC`,
      [userId]
    );

    rows.forEach(r => {
      allActivities.push({
        activityId:  `kyc_${r.id}`,
        type:        "kyc",
        subType:     r.status?.toLowerCase(),
        title:       getKycTitle(r.status),
        description: r.remarks || null,
        status:      r.status  || null,
        icon:        r.status === "approved" ? "✅" : "❌",
        createdAt:   r.created_at,
      });
    });
  }

  // ── 6. Notifications ──
  if (!type || type === "notification") {
    const [rows] = await db.query(
      `SELECT
         n.id,
         n.type       AS notif_type,
         n.title,
         n.message,
         n.link,
         n.is_read,
         n.created_at
       FROM notifications n
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC`,
      [userId]
    );

    rows.forEach(r => {
      allActivities.push({
        activityId:  `notif_${r.id}`,
        type:        "notification",
        subType:     r.notif_type,
        title:       r.title   || "Notification",
        description: r.message || null,
        link:        r.link    || null,
        isRead:      r.is_read === 1,
        icon:        getNotifIcon(r.notif_type),
        createdAt:   r.created_at,
      });
    });
  }


  // ── 7. Referral Rewards ── లో fix
const [rows] = await db.query(
  `SELECT
     rr.id,
     rr.referred_id,
     rr.first_bonus_given,
     rr.bonus_given,
     rr.join_bonus_given,
     rr.created_at,
     u.name   AS referred_name,
     u.mobile AS referred_mobile
   FROM referral_rewards rr
   LEFT JOIN users u ON u.id = rr.referred_id
   WHERE rr.referrer_id = ?
   ORDER BY rr.created_at DESC`,
  [userId]
);

rows.forEach(r => {
  allActivities.push({
    activityId:      `referral_${r.id}`,
    type:            "referral",
    subType:         r.bonus_given ? "bonus_earned" : "joined",
    title:           r.bonus_given ? "Referral Bonus Earned" : "Friend Joined via Referral",
    description:     r.referred_name || r.referred_mobile || null,  // ← phone → mobile
    firstBonusGiven: r.first_bonus_given === 1,
    bonusGiven:      r.bonus_given      === 1,
    joinBonusGiven:  r.join_bonus_given  === 1,
    icon:            "🎁",
    createdAt:       r.created_at,
  });
});

  // ── 8.  ──
  allActivities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // ── 9. Pagination ──
  const total     = allActivities.length;
  const paginated = allActivities.slice(offset, offset + limit);

  return {
    data: paginated,
    pagination: {
      current_page: page,
      per_page:     limit,
      total,
      total_pages:  Math.ceil(total / limit),
      has_more:     offset + limit < total,
    },
  };
};

// ── Helpers ──
const getWalletTitle = (transtype, wallettype) => {
  if (transtype === "credit") {
    if (wallettype === "winning") return "Winning Amount Credited";
    if (wallettype === "bonus")   return "Bonus Credited";
    if (wallettype === "deposit") return "Amount Deposited";
    return "Amount Credited";
  }
  if (transtype === "debit") {
    if (wallettype === "winning") return "Contest Fee (Winnings Used)";
    if (wallettype === "bonus")   return "Bonus Used";
    if (wallettype === "deposit") return "Contest Fee Paid";
    return "Amount Debited";
  }
  return "Wallet Transaction";
};

const getWalletIcon = (transtype, wallettype) => {
  if (transtype === "credit") return "💚";
  if (wallettype === "winning") return "🏆";
  if (wallettype === "bonus")   return "🎁";
  return "💸";
};

const getDepositTitle = (status) => {
  if (status === "success")  return "Deposit Successful";
  if (status === "pending")  return "Deposit Pending";
  if (status === "failed")   return "Deposit Failed";
  if (status === "refund")   return "Deposit Refunded";
  return "Deposit";
};

const getWithdrawTitle = (status) => {
  if (status === "APPROVED") return "Withdrawal Approved";
  if (status === "REJECTED") return "Withdrawal Rejected";
  if (status === "PENDING")  return "Withdrawal Requested";
  return "Withdrawal";
};

const getKycTitle = (status) => {
  if (status === "approved") return "KYC Verified ✅";
  if (status === "rejected") return "KYC Rejected";
  return "KYC Update";
};

const getNotifIcon = (type) => {
  if (type === "bonus")  return "🎁";
  if (type === "match")  return "⚽";
  if (type === "alert")  return "🔔";
  return "📢";
};






export const sendTransactionReportService = async (userId, year) => {

  // ── 1. User details ──
  const [[user]] = await db.query(
    `SELECT name, email FROM users WHERE id = ?`,
    [userId]
  );
  if (!user) throw new Error("User not found");
  if (!user.email) throw new Error("No email found for this user");

  // ── 2. Transactions fetch ──
  const [rows] = await db.query(
    `SELECT
       id, wallettype, transtype, amount, remark,
       reference_id, useropeningbalance, userclosingbalance, created_at
     FROM wallet_transactions
     WHERE user_id = ?
       AND YEAR(created_at) = ?
     ORDER BY id DESC`,
    [userId, year]
  );

  if (!rows.length)
    throw new Error(`No transactions found for year ${year}`);

  // ── 3. Summary ──
  const totalCredit = rows
    .filter(t => t.transtype === "credit")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const totalDebit = rows
    .filter(t => t.transtype === "debit")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // ── 4. HTML table ──
  const rows_html = rows.map((txn, i) => `
    <tr style="background: ${i % 2 === 0 ? '#f9f9f9' : '#ffffff'}">
      <td style="padding:8px;border:1px solid #ddd">${i + 1}</td>
      <td style="padding:8px;border:1px solid #ddd">${new Date(txn.created_at).toLocaleDateString("en-GB")}</td>
      <td style="padding:8px;border:1px solid #ddd">${txn.wallettype || "-"}</td>
      <td style="padding:8px;border:1px solid #ddd;color:${txn.transtype === 'credit' ? 'green' : 'red'}">
        ${txn.transtype === 'credit' ? '▲' : '▼'} ${txn.transtype}
      </td>
      <td style="padding:8px;border:1px solid #ddd;font-weight:bold">£${Number(txn.amount).toFixed(2)}</td>
      <td style="padding:8px;border:1px solid #ddd">${txn.remark || "-"}</td>
      <td style="padding:8px;border:1px solid #ddd">£${Number(txn.useropeningbalance || 0).toFixed(2)}</td>
      <td style="padding:8px;border:1px solid #ddd">£${Number(txn.userclosingbalance || 0).toFixed(2)}</td>
    </tr>
  `).join("");

  // ── 5. Full HTML ──
  const html = `
    <div style="font-family:Arial;max-width:900px;margin:auto;padding:20px">
      <div style="background:#1a1a2e;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center">
        <h2 style="margin:0">🏆 Pick2Win</h2>
        <p style="margin:5px 0;opacity:0.8">Transaction Report — ${year}</p>
      </div>

      <div style="background:#f0f4ff;padding:15px 20px;border-left:4px solid #4a90e2">
        <p style="margin:0">Hi <strong>${user.name}</strong>,</p>
        <p style="margin:5px 0">Here is your complete transaction history for <strong>${year}</strong>.</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin:15px 0">
        <tr>
          <td style="background:#e8f5e9;padding:15px;border-radius:8px;text-align:center">
            <div style="font-size:12px;color:#666">Total Credits</div>
            <div style="font-size:20px;font-weight:bold;color:green">£${totalCredit.toFixed(2)}</div>
          </td>
          <td style="width:10px"></td>
          <td style="background:#fce4ec;padding:15px;border-radius:8px;text-align:center">
            <div style="font-size:12px;color:#666">Total Debits</div>
            <div style="font-size:20px;font-weight:bold;color:red">£${totalDebit.toFixed(2)}</div>
          </td>
          <td style="width:10px"></td>
          <td style="background:#e3f2fd;padding:15px;border-radius:8px;text-align:center">
            <div style="font-size:12px;color:#666">Total Transactions</div>
            <div style="font-size:20px;font-weight:bold;color:#1565c0">${rows.length}</div>
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#1a1a2e;color:white">
            <th style="padding:10px;border:1px solid #ddd">#</th>
            <th style="padding:10px;border:1px solid #ddd">Date</th>
            <th style="padding:10px;border:1px solid #ddd">Wallet</th>
            <th style="padding:10px;border:1px solid #ddd">Type</th>
            <th style="padding:10px;border:1px solid #ddd">Amount</th>
            <th style="padding:10px;border:1px solid #ddd">Remark</th>
            <th style="padding:10px;border:1px solid #ddd">Opening</th>
            <th style="padding:10px;border:1px solid #ddd">Closing</th>
          </tr>
        </thead>
        <tbody>${rows_html}</tbody>
      </table>

      <div style="background:#f9f9f9;padding:15px;margin-top:20px;border-radius:8px;font-size:12px;color:#666;text-align:center">
        <p style="margin:0">This is an auto-generated report. Please do not reply to this email.</p>
        <p style="margin:5px 0">© ${year} Pick2Win. All rights reserved.</p>
      </div>
    </div>
  `;

  // ── 6. sendMail ──
  await sendMail({
    to:      user.email,
    subject: `Pick2Win — Your Transaction Report for ${year}`,
    html,
  });
};