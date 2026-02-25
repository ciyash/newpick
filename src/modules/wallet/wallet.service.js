import db from "../../config/db.js";


export const addDepositService = async (userId, amount) => {

  if (!amount || amount < 10)
    throw new Error("Minimum deposit £10");

  const yearMonth = new Date().toISOString().slice(0, 7);
  const conn = await db.getConnection();
 
  try {
    await conn.beginTransaction();

    
    const [[wallet]] = await conn.query(
      `SELECT deposit_limit
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );

    if (!wallet) throw new Error("Wallet not found");

    const MONTHLY_LIMIT = Number(wallet.deposit_limit);

    /* MONTHLY TRACKING */
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
      throw new Error(`You can add only £${remaining}`);

    /* UPDATE MONTHLY TABLE */
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

    /* UPDATE WALLET */
    await conn.query(
      `UPDATE wallets
       SET depositwallet = depositwallet + ?
       WHERE user_id = ?`,
      [amount, userId]
    );

    await conn.commit();

    return {
      success: true,
      monthlyLimit: MONTHLY_LIMIT,
      addedThisMonth: alreadyAdded + amount,
      remainingMonthlyLimit: remaining - amount
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


// export const addDepositService = async (
//   userId,
//   amount,
//   paymentIntentId
// ) => {
//   const conn = await db.getConnection();

//   try {
//     await conn.beginTransaction();

//     // 🛑 1️⃣ Duplicate check (idempotency)
//     const [existing] = await conn.query(
//       `SELECT id FROM wallet_transactions 
//        WHERE reference_id = ? LIMIT 1`,
//       [paymentIntentId]
//     );

//     if (existing.length > 0) {
//       // Already processed — avoid double credit
//       await conn.rollback();
//       return { message: "Already processed" };
//     }

//     // 💰 2️⃣ Update wallet balance
//     await conn.query(
//       `UPDATE wallets 
//        SET depositwallet = depositwallet + ? 
//        WHERE userid = ?`,
//       [amount, userId]
//     );

//     // 🧾 3️⃣ Insert transaction history
//     await conn.query(
//       `INSERT INTO wallet_transactions
//        (userid, amount, type, wallettype, description, reference_id)
//        VALUES (?, ?, 'credit', 'deposit', 'Stripe deposit', ?)`,
//       [userId, amount, paymentIntentId]
//     );

//     await conn.commit();

//     return {
//       success: true,
//       added: amount
//     };

//   } catch (err) {
//     await conn.rollback();
//     throw err;

//   } finally {
//     conn.release();
//   }
// };

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


// 1️⃣ FIRST define helper
export const createWalletTransaction = async ({
  conn,
  userId,
  wallettype,
  transtype,
  amount,
  remark = null,
  referenceId,
  transactionHash = null,
  ip = null,
  device = null
}) => {
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

export const deleteTransactionsByUserCodeService = async (userid) => {

  // 🔍 Convert userid → id
  const [[user]] = await db.query(
    `SELECT id FROM users WHERE userid = ?`,
    [userid]
  );

  if (!user) throw new Error("User not found");

  // 🗑 Delete using numeric ID
  const [result] = await db.query(
    `DELETE FROM wallet_transactions
     WHERE user_id = ?`,
    [user.id]
  );

  return result.affectedRows;
};

//my analytics..................................................................



export const getMyAnalyticsService = async (userId) => {

  /* ================= WALLET TRANSACTIONS ================= */

  const [transactions] = await db.query(
    `SELECT wallettype, transtype, amount
     FROM wallet_transactions
     WHERE user_id = ?`,
    [userId]
  );

  /* ================= CONTEST ENTRIES ================= */

  const [entries] = await db.query(
    `SELECT 
        ce.entry_fee,
        c.match_id,
        ce.joined_at
     FROM contest_entries ce
     JOIN contest c ON ce.contest_id = c.id
     WHERE ce.user_id = ?`,
    [userId]
  );

  /* ================= WALLET BALANCE + LIMITS ================= */

  const [[wallet]] = await db.query(
    `SELECT 
        depositwallet,
        earnwallet,
        bonusamount,
        deposit_limit,
        total_deposits
     FROM wallets
     WHERE user_id = ?`,
    [userId]
  );

  /* ================= FINANCIAL ================= */

  let deposits = 0;
  let withdrawals = 0;
  let credits = 0;
  let spending = 0; // 🔥 NEW

  for (const t of transactions) {

    // 💰 Money Deposited
    if (t.wallettype === "deposit" && t.transtype === "credit") {
      deposits += Number(t.amount);
    }

    // 💸 Money Withdrawn
    if (t.wallettype === "withdrawal" && t.transtype === "debit") {
      withdrawals += Number(t.amount);
    }

    // 🎁 Credits Received
    if (
      (t.wallettype === "winning" || t.wallettype === "refund") &&
      t.transtype === "credit"
    ) {
      credits += Number(t.amount);
    }

    // 🎮 Spending from deposit wallet
    if (t.wallettype === "deposit" && t.transtype === "debit") {
      spending += Number(t.amount);
    }
  }

  // 🎮 Contest Entry Fees (contest_entries table)
  const entryFees = entries.reduce(
    (sum, e) => sum + Number(e.entry_fee),
    0
  );

  // 💡 Total spending = entry fees + other debits
  const totalSpending = entryFees + spending;

  const netDifference = credits - deposits;

  // 💼 Wallet balance
  const walletBalance =
    Number(wallet?.depositwallet || 0) +
    Number(wallet?.earnwallet || 0) +
    Number(wallet?.bonusamount || 0);

  /* ================= ACTIVITY ================= */

  const contestsJoined = entries.length;

  const matchesPlayed = new Set(entries.map(e => e.match_id)).size;

  const activeDays = new Set(
    entries.map(e => new Date(e.joined_at).toDateString())
  ).size;

  const avgContests =
    matchesPlayed === 0
      ? 0
      : Number((contestsJoined / matchesPlayed).toFixed(2));

  /* ================= LIMITS ================= */

  const remainingLimit =
    Number(wallet?.deposit_limit || 0) -
    Number(wallet?.total_deposits || 0);

  return {
    financial: {
      money_deposited: deposits,
      money_withdrawn: withdrawals,
      wallet_balance: walletBalance,
      contest_entry_fees: entryFees,
      credits_received: credits,
      net_difference: netDifference
    },

    activity: {
      contests_joined: contestsJoined,
      matches_played: matchesPlayed,
      avg_contests_per_match: avgContests,
      active_days: activeDays
    },

    limits: {
      monthly_deposit_limit: wallet?.deposit_limit || 0,
      used_this_month: wallet?.total_deposits || 0,
      remaining: Math.max(remainingLimit, 0)
    }
  };
};

