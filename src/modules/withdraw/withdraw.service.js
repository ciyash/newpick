import db from "../../config/db.js";
import crypto from "crypto";
import { logActivity } from "../../utils/activity.logger.js";

/* ======================================================
   USER REQUEST WITHDRAW
====================================================== */
export const requestWithdrawService = async (userId, data) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const withdrawAmount = parseFloat(data.amount);
    if (isNaN(withdrawAmount) || withdrawAmount <= 0)
      throw new Error("Invalid withdrawal amount");

    // 1. Lock wallet row
    const [[wallet]] = await conn.query(
      `SELECT earnwallet, depositwallet, bonusamount,
              iskyc, is_frozen, issofverify, bank_details
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );
    if (!wallet)                  throw new Error("Wallet not found");
    if (wallet.is_frozen === 1)   throw new Error("Wallet is frozen");
    if (wallet.iskyc !== 1)       throw new Error("KYC verification not completed");
    if (wallet.issofverify !== 1) throw new Error("SOF verification not completed");
    if (!wallet.bank_details)     throw new Error("Please update and verify your bank details first");
    if (wallet.earnwallet < withdrawAmount)
      throw new Error("Insufficient earn-wallet balance");

    // 2. No duplicate pending requests
    const [[pending]] = await conn.query(
      `SELECT id FROM withdraws
       WHERE user_id = ? AND status = 'PENDING'
       LIMIT 1`,
      [userId]
    );
    if (pending) throw new Error("You already have a pending withdrawal request");

    // 3. Fetch user info
    const [[userinfo]] = await conn.query(
      `SELECT name, email, mobile FROM users WHERE id = ?`,
      [userId]
    );
    if (!userinfo) throw new Error("User not found");

    // 4. Snapshot balances BEFORE deduction
    const depositBalance  = Number(wallet.depositwallet || 0);
    const earnBalance     = Number(wallet.earnwallet    || 0);
    const bonusBalance    = Number(wallet.bonusamount   || 0);
    const snapshotOpening = Number((depositBalance + earnBalance + bonusBalance).toFixed(2));
    const snapshotClosing = Number((snapshotOpening - withdrawAmount).toFixed(2));

    // 5. Deduct from earnwallet — atomic guard
    const [updateResult] = await conn.query(
      `UPDATE wallets
       SET earnwallet = earnwallet - ?
       WHERE user_id = ? AND earnwallet >= ?`,
      [withdrawAmount, userId, withdrawAmount]
    );
    if (updateResult.affectedRows === 0)
      throw new Error("Insufficient wallet balance (concurrent update detected)");

    // 6. Insert withdrawal record
    const bankDetailsStr = typeof wallet.bank_details === "object"
      ? JSON.stringify(wallet.bank_details)
      : String(wallet.bank_details);

    const [result] = await conn.query(
      `INSERT INTO withdraws
         (user_id, amount, bank_details, phone, email, username,
          snapshot_opening, snapshot_closing,
          status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW())`,
      [
        userId,
        withdrawAmount,
        bankDetailsStr,
        String(userinfo.mobile),
        String(userinfo.email),
        String(userinfo.name),
        snapshotOpening,
        snapshotClosing,
      ]
    );

    await conn.commit();

    logActivity({
      userId,
      type:        "withdrawal",
      title:       "Withdrawal Requested",
      description: `₹${withdrawAmount} withdrawal request submitted`,
      amount:      withdrawAmount,
      icon:        "withdraw",
    });

    return {
      success:    true,
      message:    "Withdrawal request submitted successfully",
      withdrawId: result.insertId,
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ======================================================
   ADMIN APPROVE WITHDRAW
   NOTE: earnwallet already deducted at request time
    — here only update status + log transaction
====================================================== */
export const approveWithdrawService = async (adminId, withdrawId) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Lock withdraw row
    const [[withdraw]] = await conn.query(
      `SELECT * FROM withdraws
       WHERE id = ? AND status = 'PENDING'
       FOR UPDATE`,
     [String(withdrawId)] 
    );
    if (!withdraw) throw new Error("Withdraw not found or already processed");

    // 2. Get wallet for transaction log only — NO deduction here
    const [[wallet]] = await conn.query(
      `SELECT earnwallet, total_withdrawals
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [withdraw.user_id]
    );

    // opening = current balance (already deducted at request time)
    const openingBalance = Number(wallet.earnwallet);
    const closingBalance = openingBalance; // no change now

    // 3. Update total_withdrawals counter only
    await conn.query(
      `UPDATE wallets
       SET total_withdrawals = total_withdrawals + ?
       WHERE user_id = ?`,
      [withdraw.amount, withdraw.user_id]
    );

    // 4. Update withdraw status
    await conn.query(
      `UPDATE withdraws
       SET status = 'APPROVED', processed_at = NOW()
       WHERE id = ?`,
      [withdrawId]
    );

    // 5. Insert approval record
    await conn.query(
      `INSERT INTO withdraw_approvals
         (withdrawal_id, admin_id, status)
       VALUES (?, ?, 'APPROVED')`,
      [withdrawId, adminId]
    );

    // 6. Insert wallet transaction log
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
        transactionHash,
      ]
    );

    await conn.commit();

    logActivity({
      userId:      withdraw.user_id,
      type:        "withdrawal",
      sub_type:    "approved",
      title:       "Withdrawal Approved",
      description: `₹${withdraw.amount} withdrawal approved`,
      amount:      withdraw.amount,
      icon:        "withdraw",
      meta:        { withdrawId },
    });

    return { success: true, message: "Withdraw approved successfully" };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ======================================================
   ADMIN REJECT WITHDRAW
   NOTE: earnwallet was deducted at request — refund it here */

export const rejectWithdrawService = async (adminId, withdrawId, remarks) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Lock withdraw row
    const [[withdraw]] = await conn.query(
      `SELECT id, user_id, amount FROM withdraws
       WHERE id = ? AND status = 'PENDING'
       FOR UPDATE`,
      [String(withdrawId)] 
    );
    if (!withdraw) throw new Error("Withdraw not found or already processed");

    // 2. Refund earnwallet — deducted at request time, return it now
    await conn.query(
      `UPDATE wallets
       SET earnwallet = earnwallet + ?
       WHERE user_id = ?`,
      [withdraw.amount, withdraw.user_id]
    );

    // 3. Update withdraw status
    await conn.query(
      `UPDATE withdraws
       SET status = 'REJECTED', processed_at = NOW()
       WHERE id = ?`,
      [withdrawId]
    );

    // 4. Insert rejection record
    await conn.query(
      `INSERT INTO withdraw_approvals
         (withdrawal_id, admin_id, status, remarks)
       VALUES (?, ?, 'REJECTED', ?)`,
      [withdrawId, adminId, remarks || "Rejected"]
    );

    await conn.commit();

    logActivity({
      userId:      withdraw.user_id,
      type:        "withdrawal",
      sub_type:    "rejected",
      title:       "Withdrawal Rejected",
      description: `₹${withdraw.amount} withdrawal rejected — amount refunded`,
      amount:      withdraw.amount,
      icon:        "withdraw",
      meta:        { withdrawId, remarks: remarks || null },
    });

    return { success: true, message: "Withdraw rejected and amount refunded" };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* ======================================================
   USER — GET WITHDRAW HISTORY
====================================================== */
export const getMyWithdrawRequestsService = async (userId) => {

  const [rows] = await db.query(
    `SELECT
        id,
        amount,
        bank_details,
        payment_mode,
        transaction_id,
        status,
        created_at,
        processed_at
     FROM withdraws
     WHERE user_id = ?
     ORDER BY created_at DESC`,   
    [userId]
  );

  return rows.map(w => ({
    id:            w.id,
    amount:        Number(w.amount),
    bankDetails:   w.bank_details,
    paymentMode:   w.payment_mode,
    transactionId: w.transaction_id,
    status:        w.status,
    requestedAt:   w.created_at,
    processedAt:   w.processed_at,
  }));
};


export const getAllWithdrawRequestsService = async (filters = {}) => {

  const { status, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  let whereClause = "";
  const params = [];

  if (status) {
    whereClause = "WHERE w.status = ?";
    params.push(status);
  }

  const [rows] = await db.query(
    `SELECT
        w.id,
        w.user_id,
        w.amount,
        w.bank_details,
        w.phone,
        w.email,
        w.username,
        w.status,
        w.snapshot_opening,
        w.snapshot_closing,
        w.transaction_id,
        w.created_at,
        w.processed_at
     FROM withdraws w
     ${whereClause}
     ORDER BY w.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) as total FROM withdraws w ${whereClause}`,
    params
  );

  return {
    data: rows.map(w => ({
      id:              w.id,
      userId:          w.user_id,
      username:        w.username,
      email:           w.email,
      phone:           w.phone,
      amount:          Number(w.amount),
      bankDetails:     w.bank_details,
      status:          w.status,
      openingBalance:  Number(w.snapshot_opening),
      closingBalance:  Number(w.snapshot_closing),
      transactionId:   w.transaction_id,
      requestedAt:     w.created_at,
      processedAt:     w.processed_at,
    })),
    pagination: {
      total,
      page:       Number(page),
      limit:      Number(limit),
      totalPages: Math.ceil(total / limit),
    }
  };
};