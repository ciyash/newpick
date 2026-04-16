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

export const downloadAnalyticsStatement = async (req, res) => {
  try {
    const userId = req.user.id;

    const [transactions] = await db.query(
      `SELECT wallettype, transtype, amount, created_at
       FROM wallet_transactions
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    );

    const [entries] = await db.query(
      `SELECT ce.entry_fee, ce.joined_at, c.match_id
       FROM contest_entries ce
       JOIN contest c ON ce.contest_id = c.id
       WHERE ce.user_id = ?`,
      [userId]
    );

    res.status(200).json({ success: true, transactions, contest_entries: entries });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};