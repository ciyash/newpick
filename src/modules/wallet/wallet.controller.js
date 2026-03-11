import db from "../../config/db.js";
import { generateTransactionsPDF } from "../../utils/pdf.document .js";

import { sendOtpEmail } from "../../utils/send.otp.mails.js";

import {addDepositService,  getMyWalletService,getMyTransactionsService, deleteTransactionsByUserCodeService, getMyAnalyticsService} from "./wallet.service.js";

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


// export const getMyTransactions = async (req, res) => {
//   try {

//     const userId = req.user.id;
//     const { year } = req.params;

//     const result = await getMyTransactionsService(userId, year);

//     res.status(200).json({
//       success: true,
//       ...result
//     });

//   } catch (err) {

//     res.status(400).json({
//       success: false,
//       message: err.message
//     });

//   }
// };



export const getMyTransactions = async (req, res) => {
  try {

    const userId = req.user.id;
    const { year } = req.params;

    const result = await getMyTransactionsService(userId, year);

    const [[user]] = await db.query(
      `SELECT email FROM users WHERE id=?`,
      [userId]
    );

    if (!user) throw new Error("User not found");

    if (user.email && result.data && result.data.length) {

      const pdfBuffer = await generateTransactionsPDF(result.data, year);

      await sendOtpEmail(
        user.email,
        `PICK2WIN Wallet Transactions ${year}`,
        pdfBuffer
      );

    }

    res.json({
      success: true,
      ...result
    });

  } catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

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

//     if (!req.user || !req.user.id) {
//       throw new Error("User not authenticated");
//     }

//     const userId = req.user.id;

//     const data = await getMyAnalyticsService(userId);

//     res.status(200).json({
//       success: true,
//       ...data
//     });

//   } catch (error) {
//     res.status(400).json({
//       success: false,
//       message: error.message
//     });
//   }
// };



export const getMyAnalytics = async (req, res) => {
  try {

    const userId = req.user.id;
    const { type } = req.params;

    const data = await getMyAnalyticsService(userId, type);

    res.json(data);

  } catch (err) {

    res.status(500).json({
      message: err.message
    });

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