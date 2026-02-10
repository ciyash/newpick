import db from "../../config/db.js";

/* =====================================================
   🔁 COMMON WALLET TRANSACTION (COMPANY LEDGER)
===================================================== */
export const createWalletTransaction = async ({
  conn,
  userId,
  wallettype,       // deposit | withdraw | bonus
  transtype,        // credit | debit
  amount,
  remark = null,
  referenceId,
  transactionHash = null,
  ip = null,
  device = null
}) => {
  // 🔐 lock last transaction row (safe for concurrency)
  const [[last]] = await conn.query(
    `SELECT closing_balance
     FROM wallet_transactions
     ORDER BY id DESC
     LIMIT 1
     FOR UPDATE`
  );

  const openingBalance = last ? Number(last.closing_balance) : 0;

  const closingBalance =
    transtype === "credit"
      ? openingBalance + amount
      : openingBalance - amount;

  await conn.query(
    `INSERT INTO wallet_transactions
     (user_id, wallettype, transtype, remark, amount,
      opening_balance, closing_balance,
      reference_id, transaction_hash,
      ip_address, device)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      wallettype,
      transtype,
      remark,
      amount,
      openingBalance,
      closingBalance,
      referenceId,
      transactionHash,
      ip,
      device
    ]
  );
};

/* =====================================================
   💰 ADD DEPOSIT MONEY
===================================================== */
export const addDepositService = async (userId, amount, meta = {}) => {
  if (amount < 10) throw new Error("Minimum deposit is £10");

  const yearMonth = new Date().toISOString().slice(0, 7);
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    /* 1️⃣ user category */
    const [[user]] = await conn.query(
      `SELECT category FROM users WHERE id = ?`,
      [userId]
    );
    if (!user) throw new Error("User not found");

    const MONTHLY_LIMIT =
      user.category === "students" ? 300 : 1500;

    /* 2️⃣ monthly deposit lock */
    const [[row]] = await conn.query(
      `SELECT total_added
       FROM monthly_deposits
       WHERE user_id = ? AND ym = ?
       FOR UPDATE`,
      [userId, yearMonth]
    );

    const alreadyAdded = row ? Number(row.total_added) : 0;
    const remaining = MONTHLY_LIMIT - alreadyAdded;

    if (remaining <= 0)
      throw new Error(`Monthly limit £${MONTHLY_LIMIT} reached`);

    if (amount > remaining)
      throw new Error(`You can add only £${remaining} more this month`);

    /* 3️⃣ update monthly table */
    if (row) {
      await conn.query(
        `UPDATE monthly_deposits
         SET total_added = total_added + ?
         WHERE user_id = ? AND ym = ?`,
        [amount, userId, yearMonth]
      );
    } else {
      await conn.query(
        `INSERT INTO monthly_deposits (user_id, ym, total_added)
         VALUES (?, ?, ?)`,
        [userId, yearMonth, amount]
      );
    }

    /* 4️⃣ update wallet */
    await conn.query(
      `UPDATE wallets
       SET depositwallet = depositwallet + ?
       WHERE user_id = ?`,
      [amount, userId]
    );

    /* 5️⃣ ledger transaction (COMPANY) */
    await createWalletTransaction({
      conn,
      userId,
      wallettype: "deposit",
      transtype: "credit",
      amount,
      remark: "User deposit",
      referenceId: `DEP-${userId}-${Date.now()}`,
      ip: meta.ip || null,
      device: meta.device || null
    });

    await conn.commit();

    return {
      success: true,
      added: amount,
      monthlyLimit: MONTHLY_LIMIT,
      remainingMonthlyLimit: remaining - amount
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/* =====================================================
   🏆 DEDUCT FOR CONTEST
===================================================== */
export const deductForContestService = async (userId, entryFee, meta = {}) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [[wallet]] = await conn.query(
      `SELECT depositwallet, earnwallet, bonusamount
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );
    if (!wallet) throw new Error("Wallet not found");

    let remaining = entryFee;

    const bonusUsed = Math.min(wallet.bonusamount, entryFee * 0.05);
    remaining -= bonusUsed;

    const depositUsed = Math.min(wallet.depositwallet, remaining);
    remaining -= depositUsed;

    const withdrawUsed = Math.min(wallet.earnwallet, remaining);
    remaining -= withdrawUsed;

    if (remaining > 0) {
      return { allowed: false };
    }

    /* update wallet */
    await conn.query(
      `UPDATE wallets SET
        bonusamount = bonusamount - ?,
        depositwallet = depositwallet - ?,
        earnwallet = earnwallet - ?
       WHERE user_id = ?`,
      [bonusUsed, depositUsed, withdrawUsed, userId]
    );

    /* ledger entry */
    await createWalletTransaction({
      conn,
      userId,
      wallettype: "deposit",
      transtype: "debit",
      amount: entryFee,
      remark: "Contest entry fee",
      referenceId: `CNT-${userId}-${Date.now()}`,
      ip: meta.ip || null,
      device: meta.device || null
    });

    await conn.commit();

    return {
      allowed: true,
      used: { bonusUsed, depositUsed, withdrawUsed }
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const getMyWalletService = async (userId) => {
  const [[wallet]] = await db.query(
    `SELECT depositwallet, earnwallet, bonusamount
     FROM wallets
     WHERE user_id = ?`,
    [userId]
  );

  if (!wallet) throw new Error("Wallet not found");

  return {
    depositWallet: Number(wallet.depositwallet),
    withdrawWallet: Number(wallet.earnwallet),
    bonusWallet: Number(wallet.bonusamount)
  };
};


export const getMyTransactionsService = async (userId) => {
  const [rows] = await db.query(
    `SELECT
        id,
        wallettype,
        transtype,
        amount,
        remark,
        reference_id,
        created_at
     FROM wallet_transactions
     WHERE user_id = ?
     ORDER BY id DESC`,
    [userId]
  );

  return rows.map(txn => ({
    id: txn.id,
    walletType: txn.wallettype,      // deposit / withdraw / bonus
    transactionType: txn.transtype,  // credit / debit
    amount: Number(txn.amount),
    remark: txn.remark,
    referenceId: txn.reference_id,
    date: txn.created_at
  }));
};


