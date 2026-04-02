import db from "../../config/db.js";
import { generateTransactionsPDF } from "../../utils/pdf.document .js";
import { sendMail } from "../../utils/send.mail.js";


import {addDepositService,  getMyWalletService,getMyTransactionsService, deleteTransactionsByUserCodeService, getMyAnalyticsService, getMyTransactionsServiceYear} from "./wallet.service.js";

export const addMoney = async (req, res) => {
  try {
    const userId = req.user.id;   // ✅ from JWT
    const { amount } = req.body;

    const result = await addDepositService(userId, amount);

    res.json({
      success: true,
      addedAmount: result.added,
      remainingMonthlyLimit: result.remainingMonthlyLimit
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};
 
export const getMyWallet = async (req, res) => {
  try {
    const userId = req.user.id; // 🔐 from JWT

    const wallet = await getMyWalletService(userId);

    res.status(200).json({
      success: true,
      data: wallet
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};  



export const getMyTransactions = async (req, res) => {
  try {

    const userId = req.user.id;

    const result = await getMyTransactionsService(userId);

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

  }
};


export const getMyTransactionsYear = async (req, res) => {
  try {
    const userId = req.user.id;
    const { year } = req.params;

    const result = await getMyTransactionsServiceYear(userId, year);
    const transactions = result.data || [];

    if (!transactions.length) {
      return res.json({
        success: true,
        message: `No transactions found for ${year}`
      });
    }

    const [[user]] = await db.query(
      `SELECT email FROM users WHERE id = ?`,
      [userId]
    );

    const pdfBuffer = await generateTransactionsPDF(transactions, year);
console.log("PDF size:", pdfBuffer.length);
    await sendMail({
      to: user.email,
      subject: `PICK2WIN Wallet Transactions ${year}`,
      html: `<p>Your wallet statement for ${year} is attached.</p>`,
      attachments: [
        {
          filename: `wallet-transactions-${year}.pdf`,
          content: pdfBuffer
        }
      ]
    });

    res.json({
      success: true,
      message: `Transactions statement sent to ${user.email}`
    });

  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: err.message });
  }
};
















export const deleteTransactionsByUser = async (req, res) => {
  try {
    const { userid } = req.params; // ✅ only userId

    await deleteTransactionsByUserCodeService(userid);

    res.status(200).json({
      success: true,
      message: "All transactions deleted for this user"
    });

  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

// export const getMyAnalytics = async (req, res) => {
//   try {

//     const userId = req.user.id;
//     const { type } = req.params;

//     const data = await getMyAnalyticsService(userId, type);

//     res.json(data);

//   } catch (err) {

//     res.status(500).json({
//       message: err.message
//     });

//   }
// };


export const getMyAnalytics = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { type } = req.params;

    let month = null;
    let year  = null;

    if (!type || type === "all") {
      // all time — month, year both null
      month = null;
      year  = null;
    } else if (/^\d{4}$/.test(type)) {
      // 4 digits → year (e.g. 2026)
      year  = parseInt(type);
      month = null;
    } else if (/^\d{1,2}$/.test(type)) {
      // 1-2 digits → month (e.g. 1 = January, 12 = December)
      month = parseInt(type);
      year  = null;
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Use 'all', a year (2026), or a month number (1-12)"
      });
    }

    const data = await getMyAnalyticsService(userId, month, year);

    return res.status(200).json({ success: true, data });

  } catch (err) {
    console.error("[getMyAnalytics]", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


export const downloadAnalyticsStatement = async (req, res) => {
  try {

    const userId = req.user.id;

    const [transactions] = await db.query(
      `SELECT 
        wallettype,
        transtype,
        amount,
        created_at
      FROM wallet_transactions
      WHERE user_id = ?
      ORDER BY created_at DESC`,
      [userId]
    );

    const [entries] = await db.query(
      `SELECT 
        ce.entry_fee,
        ce.joined_at,
        c.match_id
      FROM contest_entries ce
      JOIN contest c ON ce.contest_id = c.id
      WHERE ce.user_id = ?`,
      [userId]
    );

    res.status(200).json({
      success: true,
      transactions,
      contest_entries: entries
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};  