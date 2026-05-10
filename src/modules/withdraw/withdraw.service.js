import db from "../../config/db.js";
import crypto from "crypto";
import { logActivity } from "../../utils/activity.logger.js";

import { getSubscriptionStatusService } from '../users/subscription.service.js';
import { NON_SUBSCRIBER_WITHDRAW_LIMIT } from "../../config/constants.js";

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

    // 3. Subscription check — limit logic
    const { data: subData } = await getSubscriptionStatusService(userId);
    const isSubscriber = subData.subscription.isActive;

    if (!isSubscriber) {
      // Non-subscriber — current month total withdrawals check
      const [[{ monthTotal }]] = await conn.query(
        `SELECT COALESCE(SUM(amount), 0) AS monthTotal
         FROM withdraws
         WHERE user_id = ?
           AND status IN ('PENDING', 'APPROVED')
           AND MONTH(created_at)  = MONTH(NOW())
           AND YEAR(created_at)   = YEAR(NOW())`,
        [userId]
      );

      const NON_SUBSCRIBER_LIMIT =  NON_SUBSCRIBER_WITHDRAW_LIMIT;;
      const alreadyWithdrawn = Number(monthTotal);
  
      if (alreadyWithdrawn + withdrawAmount > NON_SUBSCRIBER_LIMIT) {
        const remaining = NON_SUBSCRIBER_LIMIT - alreadyWithdrawn;
        throw new Error(
          remaining <= 0
            ? `Monthly withdrawal limit of £${NON_SUBSCRIBER_LIMIT} reached. Subscribe to withdraw unlimited.`
            : `Monthly limit £${NON_SUBSCRIBER_LIMIT} — only £${remaining.toFixed(2)} remaining. Subscribe to withdraw unlimited.`
        );
      }
    }
    // Subscriber — no limit, continue

    // 4. Fetch user info
    const [[userinfo]] = await conn.query(
      `SELECT name, email, mobile FROM users WHERE id = ?`,
      [userId]
    );
    if (!userinfo) throw new Error("User not found");

    // 5. Snapshot balances BEFORE deduction
    const depositBalance  = Number(wallet.depositwallet || 0);
    const earnBalance     = Number(wallet.earnwallet    || 0);
    const bonusBalance    = Number(wallet.bonusamount   || 0);
    const snapshotOpening = Number((depositBalance + earnBalance + bonusBalance).toFixed(2));
    const snapshotClosing = Number((snapshotOpening - withdrawAmount).toFixed(2));

    // 6. Deduct from earnwallet — atomic guard
    const [updateResult] = await conn.query(
      `UPDATE wallets
       SET earnwallet = earnwallet - ?
       WHERE user_id = ? AND earnwallet >= ?`,
      [withdrawAmount, userId, withdrawAmount]
    );
    if (updateResult.affectedRows === 0)
      throw new Error("Insufficient wallet balance (concurrent update detected)");

    // 7. Insert withdrawal record
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
      withdrawId: String(result.insertId),
      isSubscriber,
      ...(isSubscriber
        ? { limit: "unlimited" }
        : { limit: 2500 }
      ),
    };

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
     ORDER BY created_at DESC
     Limit 3`,
     
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



