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

    // ── Date filter ──
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
      return res.status(400).json({ success: false, message: "Invalid type. Use: all | month | year | 1-12 | YYYY" });
    }

    // ── Date filter SQL helper ──
    const dateFilter = (field) => {
      if (month !== null && year !== null) {
        return `AND MONTH(${field}) = ${month} AND YEAR(${field}) = ${year}`;
      } else if (year !== null) {
        return `AND YEAR(${field}) = ${year}`;
      } else if (month !== null) {
        return `AND MONTH(${field}) = ${month} AND YEAR(${field}) = ${currentYear}`;
      }
      return "";
    };

    const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    // ── Format filter label ──
    const filterLabel = (() => {
      if (!type || type === "all") return "All Time";
      if (type === "month")        return `${MONTH_NAMES[currentMonth - 1]} ${currentYear}`;
      if (type === "year")         return `${currentYear}`;
      if (/^\d{4}$/.test(type))   return `${type}`;
      if (/^\d{1,2}$/.test(type)) return `${MONTH_NAMES[parseInt(type) - 1]} ${currentYear}`;
      return type;
    })();

    // ── 1. Wallet transactions (full detail) ──
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
       ${dateFilter("created_at")}
       ORDER BY created_at ASC`,
      [userId]
    );

    // ── 2. Financial summary ──
    const [[financial]] = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN wallettype = 'deposit'    AND transtype = 'credit' THEN amount ELSE 0 END), 0) AS total_deposits,
         COALESCE(SUM(CASE WHEN wallettype = 'withdrawal' AND transtype = 'debit'  THEN amount ELSE 0 END), 0) AS total_withdrawals,
         COALESCE(SUM(CASE WHEN wallettype = 'winning'    AND transtype = 'credit' THEN amount ELSE 0 END), 0) AS total_winnings,
         COALESCE(SUM(CASE WHEN wallettype = 'refund'     AND transtype = 'credit' THEN amount ELSE 0 END), 0) AS total_refunds,
         COALESCE(SUM(CASE WHEN wallettype = 'bonus'      AND transtype = 'credit' THEN amount ELSE 0 END), 0) AS total_bonus,
         COALESCE(SUM(CASE WHEN wallettype = 'contest'    AND transtype = 'debit'  THEN amount ELSE 0 END), 0) AS total_entry_fees_paid,
         COALESCE(SUM(CASE WHEN transtype = 'credit'      THEN amount ELSE 0 END), 0)                          AS total_credited,
         COALESCE(SUM(CASE WHEN transtype = 'debit'       THEN amount ELSE 0 END), 0)                          AS total_debited,
         COUNT(*) AS total_transactions
       FROM wallet_transactions
       WHERE user_id = ?
       ${dateFilter("created_at")}`,
      [userId]
    );

    // ── 3. Contest entries (full detail) ──
    const [contestEntries] = await db.query(
      `SELECT
         ce.id            AS entry_id,
         ce.contest_id,
         ce.entry_fee,
         ce.urank         AS final_rank,
         ce.winning_amount,
         ce.joined_at,
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
       ${dateFilter("ce.joined_at")}
       ORDER BY ce.joined_at DESC`,
      [userId]
    );

    // ── 4. Contest performance summary ──
    const [[contestSummary]] = await db.query(
      `SELECT
         COUNT(*)                                                       AS total_contests_joined,
         COUNT(CASE WHEN ce.winning_amount > 0 THEN 1 END)             AS total_contests_won,
         COALESCE(SUM(ce.entry_fee), 0)                                AS total_entry_fees,
         COALESCE(SUM(ce.winning_amount), 0)                           AS total_winnings_from_contests,
         COALESCE(AVG(NULLIF(ce.urank, 0)), 0)                         AS avg_rank,
         MIN(NULLIF(ce.urank, 0))                                      AS best_rank
       FROM contest_entries ce
       JOIN contest c ON c.id = ce.contest_id
       WHERE ce.user_id = ?
       ${dateFilter("ce.joined_at")}`,
      [userId]
    );

    // ── 5. Monthly breakdown with opening & closing balance ──
    const [monthlyBreakdown] = await db.query(
      `SELECT
         YEAR(created_at)  AS year,
         MONTH(created_at) AS month,
         COUNT(*)          AS transactions_count,
         COALESCE(SUM(CASE WHEN wallettype = 'deposit'    AND transtype = 'credit' THEN amount ELSE 0 END), 0) AS deposits,
         COALESCE(SUM(CASE WHEN wallettype = 'withdrawal' AND transtype = 'debit'  THEN amount ELSE 0 END), 0) AS withdrawals,
         COALESCE(SUM(CASE WHEN wallettype = 'winning'    AND transtype = 'credit' THEN amount ELSE 0 END), 0) AS winnings,
         COALESCE(SUM(CASE WHEN wallettype = 'contest'    AND transtype = 'debit'  THEN amount ELSE 0 END), 0) AS entry_fees,
         COALESCE(SUM(CASE WHEN wallettype = 'bonus'      AND transtype = 'credit' THEN amount ELSE 0 END), 0) AS bonus,
         COALESCE(SUM(CASE WHEN wallettype = 'refund'     AND transtype = 'credit' THEN amount ELSE 0 END), 0) AS refunds,
         COALESCE(SUM(CASE WHEN transtype = 'credit' THEN amount ELSE 0 END), 0) AS total_credited,
         COALESCE(SUM(CASE WHEN transtype = 'debit'  THEN amount ELSE 0 END), 0) AS total_debited,
         (SELECT wt2.opening_balance
          FROM wallet_transactions wt2
          WHERE wt2.user_id = wallet_transactions.user_id
            AND YEAR(wt2.created_at)  = YEAR(wallet_transactions.created_at)
            AND MONTH(wt2.created_at) = MONTH(wallet_transactions.created_at)
          ORDER BY wt2.created_at ASC, wt2.id ASC
          LIMIT 1
         ) AS opening_balance,
         (SELECT wt3.closing_balance
          FROM wallet_transactions wt3
          WHERE wt3.user_id = wallet_transactions.user_id
            AND YEAR(wt3.created_at)  = YEAR(wallet_transactions.created_at)
            AND MONTH(wt3.created_at) = MONTH(wallet_transactions.created_at)
          ORDER BY wt3.created_at DESC, wt3.id DESC
          LIMIT 1
         ) AS closing_balance
       FROM wallet_transactions
       WHERE user_id = ?
       GROUP BY YEAR(created_at), MONTH(created_at)
       ORDER BY year DESC, month DESC
       LIMIT 24`,
      [userId]
    );

    // ── 6. Current wallet balances (per wallet type) ──
    const [walletBalances] = await db.query(
      `SELECT
         wt.wallettype,
         wt.closing_balance AS current_balance,
         wt.created_at      AS balance_as_of
       FROM wallet_transactions wt
       INNER JOIN (
         SELECT wallettype, MAX(id) AS max_id
         FROM wallet_transactions
         WHERE user_id = ?
         GROUP BY wallettype
       ) latest ON wt.wallettype = latest.wallettype AND wt.id = latest.max_id
       WHERE wt.user_id = ?
       ORDER BY wt.wallettype`,
      [userId, userId]
    );

    // ── 7. Per-wallet-type summary ──
    const [walletTypeSummary] = await db.query(
      `SELECT
         wallettype,
         transtype,
         COUNT(*)                 AS transaction_count,
         COALESCE(SUM(amount), 0) AS total_amount
       FROM wallet_transactions
       WHERE user_id = ?
       ${dateFilter("created_at")}
       GROUP BY wallettype, transtype
       ORDER BY wallettype, transtype`,
      [userId]
    );

    // ── Net P&L ──
    const totalIn  = Number(financial.total_deposits  || 0)
                   + Number(financial.total_winnings  || 0)
                   + Number(financial.total_refunds   || 0)
                   + Number(financial.total_bonus     || 0);
    const totalOut = Number(financial.total_withdrawals     || 0)
                   + Number(financial.total_entry_fees_paid || 0);
    const netPnL   = totalIn - totalOut;

    // ── Win rate & ROI ──
    const totalJoined    = Number(contestSummary.total_contests_joined        || 0);
    const totalWon       = Number(contestSummary.total_contests_won           || 0);
    const totalEntryFees = Number(contestSummary.total_entry_fees             || 0);
    const totalWinnings  = Number(contestSummary.total_winnings_from_contests || 0);
    const winRate        = totalJoined > 0 ? ((totalWon / totalJoined) * 100).toFixed(2) : "0.00";
    const roi            = totalEntryFees > 0
      ? (((totalWinnings - totalEntryFees) / totalEntryFees) * 100).toFixed(2)
      : "0.00";

    // ── Build response ──
    return res.status(200).json({
      success: true,
      generated_at: new Date().toISOString(),

      filter: {
        type:  type || "all",
        label: filterLabel,
        month: month || null,
        year:  year  || null,
      },

      financial_summary: {
        total_deposits:        Number(financial.total_deposits        || 0),
        total_withdrawals:     Number(financial.total_withdrawals     || 0),
        total_winnings:        Number(financial.total_winnings        || 0),
        total_refunds:         Number(financial.total_refunds         || 0),
        total_bonus:           Number(financial.total_bonus           || 0),
        total_entry_fees_paid: Number(financial.total_entry_fees_paid || 0),
        total_credited:        Number(financial.total_credited        || 0),
        total_debited:         Number(financial.total_debited         || 0),
        total_transactions:    Number(financial.total_transactions    || 0),
        net_pnl:               parseFloat(netPnL.toFixed(2)),
      },

      wallet_type_summary: walletTypeSummary.map(w => ({
        wallet_type:       w.wallettype,
        direction:         w.transtype,
        transaction_count: Number(w.transaction_count),
        total_amount:      Number(w.total_amount),
      })),

      wallet_balances: walletBalances.map(w => ({
        wallet_type:     w.wallettype,
        current_balance: Number(w.current_balance || 0),
        balance_as_of:   w.balance_as_of,
      })),

      contest_summary: {
        total_joined:     totalJoined,
        total_won:        totalWon,
        total_lost:       totalJoined - totalWon,
        win_rate_percent: parseFloat(winRate),
        total_entry_fees: totalEntryFees,
        total_winnings:   totalWinnings,
        net_contest_pnl:  parseFloat((totalWinnings - totalEntryFees).toFixed(2)),
        avg_rank:         parseFloat(Number(contestSummary.avg_rank || 0).toFixed(1)),
        best_rank:        contestSummary.best_rank || null,
        roi_percent:      parseFloat(roi),
      },

      monthly_breakdown: monthlyBreakdown.map(m => ({
        year:               Number(m.year),
        month:              Number(m.month),
        month_name:         MONTH_NAMES[Number(m.month) - 1],
        label:              `${MONTH_NAMES[Number(m.month) - 1]} ${m.year}`,
        transactions_count: Number(m.transactions_count),
        opening_balance:    Number(m.opening_balance  || 0),
        closing_balance:    Number(m.closing_balance  || 0),
        deposits:           Number(m.deposits         || 0),
        winnings:           Number(m.winnings         || 0),
        bonus:              Number(m.bonus            || 0),
        refunds:            Number(m.refunds          || 0),
        total_credited:     Number(m.total_credited   || 0),
        withdrawals:        Number(m.withdrawals      || 0),
        entry_fees:         Number(m.entry_fees       || 0),
        total_debited:      Number(m.total_debited    || 0),
        net:                parseFloat((Number(m.total_credited || 0) - Number(m.total_debited || 0)).toFixed(2)),
      })),

      transactions: transactions.map(t => {
        const amount  = Number(t.amount);
        const opening = Number(t.opening_balance || 0);
        const closing = Number(t.closing_balance || 0);
        const sign    = t.transtype === "credit" ? "+" : "-";
        return {
          id:              t.id,
          wallet_type:     t.wallettype,
          direction:       t.transtype,
          amount:          amount,
          amount_display:  `${sign}${amount.toFixed(2)}`,
          opening_balance: opening,
          closing_balance: closing,
          balance_change:  parseFloat((closing - opening).toFixed(2)),
          ledger_line:     `${t.transtype} ${sign}${amount.toFixed(2)}  |  balance: ${opening.toFixed(2)} → ${closing.toFixed(2)}`,
          remark:          t.remark       || null,
          reference_id:    t.reference_id || null,
          date:            t.created_at,
        };
      }),

      contest_entries: contestEntries.map(e => ({
        entry_id:       e.entry_id,
        contest_id:     e.contest_id,
        contest_type:   e.contest_type,
        match:          `${e.hometeamname} vs ${e.awayteamname}`,
        match_date:     e.matchdate,
        match_status:   e.match_status,
        series:         e.series_name   || null,
        prize_pool:     Number(e.prize_pool || 0),
        entry_fee:      Number(e.entry_fee),
        final_rank:     e.final_rank    || null,
        winning_amount: Number(e.winning_amount || 0),
        result:         e.winning_amount > 0
          ? "WON"
          : e.contest_status === "COMPLETED" ? "LOST" : "PENDING",
        joined_at:      e.joined_at,
      })),
    });

  } catch (err) {
    console.error("[downloadAnalyticsStatement]", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};