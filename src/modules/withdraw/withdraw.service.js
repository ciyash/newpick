import db from "../../config/db.js";
import crypto from "crypto";

/* ======================================================
   🟢 USER REQUEST WITHDRAW
====================================================== */
export const requestWithdrawService = async (userId, data) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const { amount, bankDetails, paymentMode } = data;
    const withdrawAmount = parseFloat(amount);

    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      throw new Error("Invalid withdraw amount");
    }

    const [[wallet]] = await conn.query(
      `SELECT earnwallet, iskyc, is_frozen
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );

    if (!wallet) throw new Error("Wallet not found");
    if (wallet.is_frozen === 1) throw new Error("Wallet frozen");
    // if (wallet.iskyc !== 1) throw new Error("KYC not completed");
    if (wallet.earnwallet < withdrawAmount)
      throw new Error("Insufficient withdraw balance");

    const [result] = await conn.query(
      `INSERT INTO withdraws
       (user_id, amount, bank_details, payment_mode, status)
       VALUES (?, ?, ?, ?, 'PENDING')`,  
      [userId, withdrawAmount, bankDetails, paymentMode]
    );

    await conn.commit();

    return {
      success: true,
      message: "Withdraw request submitted",
      withdrawId: result.insertId
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


/* ======================================================
   🟢 ADMIN APPROVE WITHDRAW
====================================================== */
export const approveWithdrawService = async (adminId, withdrawId) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [[withdraw]] = await conn.query(
      `SELECT * FROM withdraws
       WHERE id = ?
       AND status = 'PENDING'
       FOR UPDATE`,
      [withdrawId]
    );

    if (!withdraw)
      throw new Error("Withdraw not found or already processed");

    const [[wallet]] = await conn.query(
      `SELECT earnwallet, total_withdrawals
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [withdraw.user_id]
    );

    if (wallet.earnwallet < withdraw.amount)
      throw new Error("Insufficient balance at approval time");

    const openingBalance = wallet.earnwallet;
    const closingBalance = openingBalance - withdraw.amount;

    /* 🔻 Update wallet */
    await conn.query(
      `UPDATE wallets
       SET earnwallet = ?,
           total_withdrawals = total_withdrawals + ?
       WHERE user_id = ?`,
      [closingBalance, withdraw.amount, withdraw.user_id]
    );

    /* 🔻 Update withdraw status */
    await conn.query(
      `UPDATE withdraws
       SET status = 'APPROVED',
           processed_at = NOW()
       WHERE id = ?`,
      [withdrawId]
    );

    /* 🔻 Insert approval record */
    await conn.query(
      `INSERT INTO withdraw_approvals
       (withdrawal_id, admin_id, status)
       VALUES (?, ?, 'APPROVED')`,
      [withdrawId, adminId]
    );

    /* 🔻 Insert wallet transaction */
    const transactionHash = crypto
      .createHash("sha256")
      .update(`${withdraw.user_id}-${withdrawId}-${Date.now()}`)
      .digest("hex");

    await conn.query(
      `INSERT INTO wallet_transactions
       (user_id, wallettype, transtype, remark, amount,
        opening_balance, closing_balance,
        reference_id, transaction_hash)
       VALUES (?, 'earn', 'debit', ?, ?, ?, ?, ?, ?)`,
      [
        withdraw.user_id,
        "Withdraw Approved",
        withdraw.amount,
        openingBalance,
        closingBalance,
        `WD-${withdrawId}`,
        transactionHash
      ]
    );

    await conn.commit();

    return {
      success: true,
      message: "Withdraw approved successfully"
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


/* ======================================================
   🔴 ADMIN REJECT WITHDRAW
====================================================== */
export const rejectWithdrawService = async (
  adminId,
  withdrawId,
  remarks
) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [[withdraw]] = await conn.query(
      `SELECT id FROM withdraws
       WHERE id = ?
       AND status = 'PENDING'
       FOR UPDATE`,
      [withdrawId]
    );

    if (!withdraw)
      throw new Error("Withdraw not found or already processed");

    await conn.query(
      `UPDATE withdraws
       SET status = 'REJECTED',
           processed_at = NOW()
       WHERE id = ?`,
      [withdrawId]
    );

    await conn.query(
      `INSERT INTO withdraw_approvals
       (withdrawal_id, admin_id, status, remarks)
       VALUES (?, ?, 'REJECTED', ?)`,
      [withdrawId, adminId, remarks || "Rejected"]
    );

    await conn.commit();

    return {
      success: true,
      message: "Withdraw rejected"
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};