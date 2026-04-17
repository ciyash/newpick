import db from "../../config/db.js";
import { generateTransactionsPDF } from "../../utils/pdf.document .js";
import { sendMail } from "../../utils/send.mail.js";
import {
  addDepositService,
  getMyWalletService,
  getMyTransactionsService,
  deleteTransactionsByUserCodeService,
  getMyAnalyticsService,
  getMyTransactionsServiceYear,
} from "./wallet.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// ADD MONEY
// ─────────────────────────────────────────────────────────────────────────────

export const addMoney = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    const result = await addDepositService(userId, amount);

    res.json({
      success:                true,
      addedAmount:            result.addedAmount,
      newBalance:             result.newBalance,
      remainingMonthlyLimit:  result.remainingMonthlyLimit,
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MY WALLET
// ─────────────────────────────────────────────────────────────────────────────

export const getMyWallet = async (req, res) => {
  try {
    const wallet = await getMyWalletService(req.user.id);
    res.status(200).json({ success: true, data: wallet });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MY TRANSACTIONS
// ─────────────────────────────────────────────────────────────────────────────

export const getMyTransactions = async (req, res) => {
  try {
    const result = await getMyTransactionsService(req.user.id);
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MY TRANSACTIONS BY YEAR — sends PDF to email
// ─────────────────────────────────────────────────────────────────────────────

export const getMyTransactionsYear = async (req, res) => {
  try {
    const userId = req.user.id;
    const { year } = req.params;

    const result       = await getMyTransactionsServiceYear(userId, year);
    const transactions = result.data || [];

    if (!transactions.length) {
      return res.json({ success: true, message: `No transactions found for ${year}` });
    }

    const [[user]] = await db.query(`SELECT email FROM users WHERE id = ?`, [userId]);

    const pdfBuffer = await generateTransactionsPDF(transactions, year);
    console.log("PDF size:", pdfBuffer.length);

    await sendMail({
      to:      user.email,
      subject: `PICK2WIN Wallet Transactions ${year}`,
      html:    `<p>Your wallet statement for ${year} is attached.</p>`,
      attachments: [{ filename: `wallet-transactions-${year}.pdf`, content: pdfBuffer }],
    });

    res.json({ success: true, message: `Transactions statement sent to ${user.email}` });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE TRANSACTIONS BY USER (admin/debug)
// ─────────────────────────────────────────────────────────────────────────────

export const deleteTransactionsByUser = async (req, res) => {
  try {
    const { userid } = req.params;
    await deleteTransactionsByUserCodeService(userid);
    res.status(200).json({ success: true, message: "All transactions deleted for this user" });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MY ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────

export const getMyAnalytics = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { type }    = req.params;
    const now         = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let month = null;
    let year  = null;

    if (!type || type === "all") {
      // all time — no filter
    } else if (type === "year") {
      year = currentYear;
    } else if (type === "month") {
      month = currentMonth;
      year  = currentYear;
    } else if (/^\d{4}$/.test(type)) {
      year = parseInt(type);
    } else if (/^\d{1,2}$/.test(type) && parseInt(type) >= 1 && parseInt(type) <= 12) {
      month = parseInt(type);
      year  = currentYear;
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Use 'all', 'year', 'month', a year (2026), or month number (1-12)",
      });
    }

    const data = await getMyAnalyticsService(userId, month, year);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("[getMyAnalytics]", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD ANALYTICS STATEMENT
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD ANALYTICS STATEMENT — Full Version
// Route: GET /analytics/statement
// Query params: ?type=all|year|month|2026|1-12  (default: all)
// ─────────────────────────────────────────────────────────────────────────────


export const downloadAnalyticsStatement = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // ── Date filter (same logic as getMyAnalytics) ──
    const { type } = req.query;
    const now          = new Date();
    const currentYear  = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let month = null;
    let year  = null;

    if (!type || type === "all") {
      // no filter
    } else if (type === "year") {
      year = currentYear;
    } else if (type === "month") {
      month = currentMonth;
      year  = currentYear;
    } else if (/^\d{4}$/.test(type)) {
      year = parseInt(type);
    } else if (/^\d{1,2}$/.test(type) && parseInt(type) >= 1 && parseInt(type) <= 12) {
      month = parseInt(type);
      year  = currentYear;
    } else {
      return res.status(400).json({ success: false, message: "Invalid type" });
    }

    // ── Build WHERE clause helper ──
    const buildWhere = (baseField, extraConditions = []) => {
      const conditions = [...extraConditions];
      if (month !== null && year !== null) {
        conditions.push(`MONTH(${baseField}) = ${month}`, `YEAR(${baseField}) = ${year}`);
      } else if (year !== null) {
        conditions.push(`YEAR(${baseField}) = ${year}`);
      } else if (month !== null) {
        conditions.push(`MONTH(${baseField}) = ${month}`, `YEAR(${baseField}) = ${currentYear}`);
      }
      return conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    };

    // ── 1. User info ──
    const [[user]] = await db.query(
      `SELECT name, nickname, email, mobile, created_at AS member_since FROM users WHERE id = ?`,
      [userId]
    );

    // ── 2. Wallet transactions (full detail) ──
    const [transactions] = await db.query(
      `SELECT
         id,
         wallettype,
         transtype,
         remark,
         amount,
         opening_balance,
         closing_balance,
         reference_id,
         created_at
       FROM wallet_transactions
       WHERE user_id = ?
       ${month || year ? `AND YEAR(created_at) = ${year || currentYear}${month ? ` AND MONTH(created_at) = ${month}` : ""}` : ""}
       ORDER BY created_at DESC`,
      [userId]
    );

    // ── 3. Financial summary ──
    const [[financial]] = await db.query(
      `SELECT
         SUM(CASE WHEN wallettype = 'deposit'    AND transtype = 'credit' THEN amount ELSE 0 END) AS total_deposits,
         SUM(CASE WHEN wallettype = 'withdrawal' AND transtype = 'debit'  THEN amount ELSE 0 END) AS total_withdrawals,
         SUM(CASE WHEN wallettype = 'winning'    AND transtype = 'credit' THEN amount ELSE 0 END) AS total_winnings,
         SUM(CASE WHEN wallettype = 'refund'     AND transtype = 'credit' THEN amount ELSE 0 END) AS total_refunds,
         SUM(CASE WHEN wallettype = 'bonus'      AND transtype = 'credit' THEN amount ELSE 0 END) AS total_bonus,
         SUM(CASE WHEN wallettype = 'contest'    AND transtype = 'debit'  THEN amount ELSE 0 END) AS total_entry_fees_paid,
         COUNT(*)                                                                                   AS total_transactions
       FROM wallet_transactions
       WHERE user_id = ?
       ${month || year ? `AND YEAR(created_at) = ${year || currentYear}${month ? ` AND MONTH(created_at) = ${month}` : ""}` : ""}`,
      [userId]
    );

    // ── 4. Contest entries (full detail) ──
    const [contestEntries] = await db.query(
      `SELECT
         ce.id            AS entry_id,
         ce.contest_id,
         ce.entry_fee,
         ce.urank         AS final_rank,
         ce.winning_amount,
        
         c.contest_type,
         c.prize_pool,
         c.status         AS contest_status,
         m.hometeamname,
         m.awayteamname,
         m.matchdate,
         m.status         AS match_status,
         s.name           AS series_name
       FROM contest_entries ce
       JOIN contest  c ON c.id = ce.contest_id
       JOIN matches  m ON m.id = c.match_id
       LEFT JOIN series s ON s.seriesid = m.series_id
       WHERE ce.user_id = ?
       ${month || year ? `AND YEAR(ce.joined_at) = ${year || currentYear}${month ? ` AND MONTH(ce.joined_at) = ${month}` : ""}` : ""}
       ORDER BY ce.joined_at DESC`,
      [userId]
    );

    // ── 5. Contest performance summary ──
    const [[contestSummary]] = await db.query(
      `SELECT
         COUNT(*)                                                        AS total_contests_joined,
         COUNT(CASE WHEN ce.winning_amount > 0 THEN 1 END)              AS total_contests_won,
         COALESCE(SUM(ce.entry_fee), 0)                                 AS total_entry_fees,
         COALESCE(SUM(ce.winning_amount), 0)                            AS total_winnings_from_contests,
         COALESCE(AVG(ce.urank), 0)                                     AS avg_rank,
         MIN(ce.urank)                                                   AS best_rank
       FROM contest_entries ce
       JOIN contest c ON c.id = ce.contest_id
       WHERE ce.user_id = ?
       ${month || year ? `AND YEAR(ce.joined_at) = ${year || currentYear}${month ? ` AND MONTH(ce.joined_at) = ${month}` : ""}` : ""}`,
      [userId]
    );

    // ── 6. Monthly breakdown ──
    const [monthlyBreakdown] = await db.query(
      `SELECT
         YEAR(created_at)  AS year,
         MONTH(created_at) AS month,
         SUM(CASE WHEN wallettype = 'deposit'    AND transtype = 'credit' THEN amount ELSE 0 END) AS deposits,
         SUM(CASE WHEN wallettype = 'withdrawal' AND transtype = 'debit'  THEN amount ELSE 0 END) AS withdrawals,
         SUM(CASE WHEN wallettype = 'winning'    AND transtype = 'credit' THEN amount ELSE 0 END) AS winnings,
         SUM(CASE WHEN wallettype = 'contest'    AND transtype = 'debit'  THEN amount ELSE 0 END) AS entry_fees
       FROM wallet_transactions
       WHERE user_id = ?
       GROUP BY YEAR(created_at), MONTH(created_at)
       ORDER BY year DESC, month DESC
       LIMIT 12`,
      [userId]
    );

    // ── 7. Last activity ──
    const [[lastActivity]] = await db.query(
      `SELECT MAX(activity_time) AS last_activity FROM (
         SELECT created_at AS activity_time FROM wallet_transactions WHERE user_id = ?
         UNION ALL
         SELECT joined_at  AS activity_time FROM contest_entries    WHERE user_id = ?
       ) AS all_activities`,
      [userId, userId]
    );

    // ── 8. Current wallet balances ──
    const [walletBalances] = await db.query(
      `SELECT wallettype, closing_balance AS balance, created_at AS as_of
       FROM wallet_transactions
       WHERE user_id = ?
       AND id IN (
         SELECT MAX(id) FROM wallet_transactions
         WHERE user_id = ?
         GROUP BY wallettype
       )`,
      [userId, userId]
    );

    // ── Net P&L calculation ──
    const totalIn  = Number(financial.total_deposits || 0)
                   + Number(financial.total_winnings  || 0)
                   + Number(financial.total_refunds   || 0)
                   + Number(financial.total_bonus     || 0);
    const totalOut = Number(financial.total_withdrawals    || 0)
                   + Number(financial.total_entry_fees_paid || 0);
    const netPnL   = totalIn - totalOut;

    // ── Win rate ──
    const totalJoined = Number(contestSummary.total_contests_joined || 0);
    const totalWon    = Number(contestSummary.total_contests_won    || 0);
    const winRate     = totalJoined > 0 ? ((totalWon / totalJoined) * 100).toFixed(2) : "0.00";

    // ── Build response ──
    return res.status(200).json({
      success: true,
      generated_at: new Date().toISOString(),
      filter: {
        type: type || "all",
        month: month || null,
        year:  year  || null,
      },

      // ── User profile ──
      user: {
        name:          user?.nickname || user?.name || null,
        email:         user?.email    || null,
        mobile:        user?.mobile   || null,
        member_since:  user?.member_since || null,
        last_activity: lastActivity?.last_activity || null,
      },

      // ── Financial summary ──
      financial_summary: {
        total_deposits:        Number(financial.total_deposits        || 0),
        total_withdrawals:     Number(financial.total_withdrawals     || 0),
        total_winnings:        Number(financial.total_winnings        || 0),
        total_refunds:         Number(financial.total_refunds         || 0),
        total_bonus:           Number(financial.total_bonus           || 0),
        total_entry_fees_paid: Number(financial.total_entry_fees_paid || 0),
        total_transactions:    Number(financial.total_transactions    || 0),
        net_pnl:               Number(netPnL.toFixed(2)),
      },

      // ── Contest performance ──
      contest_summary: {
        total_joined:       totalJoined,
        total_won:          totalWon,
        win_rate_percent:   parseFloat(winRate),
        total_entry_fees:   Number(contestSummary.total_entry_fees           || 0),
        total_winnings:     Number(contestSummary.total_winnings_from_contests || 0),
        avg_rank:           Number(contestSummary.avg_rank                   || 0).toFixed(1),
        best_rank:          contestSummary.best_rank || null,
        roi_percent:        contestSummary.total_entry_fees > 0
          ? (((contestSummary.total_winnings_from_contests - contestSummary.total_entry_fees)
              / contestSummary.total_entry_fees) * 100).toFixed(2)
          : "0.00",
      },

      // ── Current wallet balances ──
      wallet_balances: walletBalances,

      // ── Monthly breakdown ──
      monthly_breakdown: monthlyBreakdown,

      // ── All transactions (full list) ──
      transactions: transactions.map(t => ({
        id:               t.id,
        type:             t.wallettype,
        direction:        t.transtype,
        amount:           Number(t.amount),
        opening_balance:  Number(t.opening_balance || 0),
        closing_balance:  Number(t.closing_balance || 0),
        remark:           t.remark || null,
        reference_id:     t.reference_id || null,
        date:             t.created_at,
      })),

      // ── All contest entries (full list) ──
      contest_entries: contestEntries.map(e => ({
        entry_id:         e.entry_id,
        contest_id:       e.contest_id,
        contest_type:     e.contest_type,
        match:            `${e.hometeamname} vs ${e.awayteamname}`,
        match_date:       e.matchdate,
        series:           e.series_name || null,
        entry_fee:        Number(e.entry_fee),
        final_rank:       e.final_rank  || null,
        winning_amount:   Number(e.winning_amount || 0),
      result: e.winning_amount > 0 ? "WON" : e.contest_status === "COMPLETED" ? "LOST" : "PENDING",
        joined_at:        e.joined_at,
      })),
    });

  } catch (err) {
    console.error("[downloadAnalyticsStatement]", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};