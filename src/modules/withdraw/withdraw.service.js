import db from "../../config/db.js";
import crypto from "crypto";

/* ======================================================
   🟢 USER REQUEST WITHDRAW
====================================================== */
export const requestWithdrawServiceold = async (userId, data) => {
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

async function getCompanyBalance(conn) {
  const [[row]] = await conn.query(
    `SELECT closing_balance
     FROM wallet_transactions
     WHERE closing_balance != 0
     ORDER BY id DESC
     LIMIT 1
     FOR UPDATE`
  );
  return Number(row?.closing_balance || 0);
}

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
    if (!wallet)              throw new Error("Wallet not found");
    if (wallet.is_frozen === 1) throw new Error("Wallet is frozen");
    if (wallet.iskyc !== 1)     throw new Error("KYC verification not completed");
    if (wallet.issofverify !== 1) throw new Error("SOF verification not completed");
    if (!wallet.bank_details)   throw new Error("Please update and verify your bank details (SOF) first");
    if (wallet.earnwallet < withdrawAmount)
      throw new Error("Insufficient earn-wallet balance");

    // 2. No duplicate pending requests
    const [[pending]] = await conn.query(
      `SELECT id FROM withdraws WHERE user_id = ? AND status = 'PENDING' LIMIT 1`,
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
    const depositBalance = Number(wallet.depositwallet || 0);
    const earnBalance    = Number(wallet.earnwallet    || 0);
    const bonusBalance   = Number(wallet.bonusamount   || 0);

    const snapshotOpening = Number((depositBalance + earnBalance + bonusBalance).toFixed(2));
    const snapshotClosing = Number((snapshotOpening - withdrawAmount).toFixed(2));

    // 5. Deduct from earnwallet (atomic, guards against race conditions)
    const [updateResult] = await conn.query(
      `UPDATE wallets
       SET earnwallet = earnwallet - ?
       WHERE user_id = ? AND earnwallet >= ?`,
      [withdrawAmount, userId, withdrawAmount]
    );
    if (updateResult.affectedRows === 0)
      throw new Error("Insufficient wallet balance (concurrent update detected)");

    // 6. Insert withdrawal record — include balance snapshot columns
    //    Requires: ALTER TABLE withdraws
    //      ADD COLUMN snapshot_opening DECIMAL(15,2) NOT NULL DEFAULT 0,
    //      ADD COLUMN snapshot_closing DECIMAL(15,2) NOT NULL DEFAULT 0;
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