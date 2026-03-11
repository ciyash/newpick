import db from "../../config/db.js";
import { sendMail } from "../../utils/send.mail.js"

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

    /* 1️⃣ Get transactions */

    const result = await getMyTransactionsService(userId, year);

    /* 2️⃣ Get user email */

    const [[user]] = await db.query(
      `SELECT email FROM users WHERE id = ?`,
      [userId]
    );

    /* 3️⃣ Send email only if email exists */

    if (user && user.email && result.data && result.data.length) {

      const html = `
        <h3>PICK2WIN Wallet Transactions (${year})</h3>

        <table border="1" cellpadding="6" cellspacing="0">
          <tr>
            <th>ID</th>
            <th>Wallet Type</th>
            <th>Transaction Type</th>
            <th>Amount</th>
            <th>Remark</th>
            <th>Date</th>
          </tr>

          ${result.data.map(txn => `
            <tr>
              <td>${txn.id}</td>
              <td>${txn.walletType}</td>
              <td>${txn.transactionType}</td>
              <td>${txn.amount}</td>
              <td>${txn.remark}</td>
              <td>${txn.date}</td>
            </tr>
          `).join("")}

        </table>
      `;

      try {

        await sendMail(
          user.email,
          `PICK2WIN Wallet Transactions ${year}`,
          html
        );

      } catch (mailErr) {

        console.log("Email sending failed:", mailErr.message);

      }

    }

    /* 4️⃣ Return API response */

    res.status(200).json({
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