import db from "../../config/db.js";


// export const addDepositService = async (userId, amount, meta = {}) => {
//   if (!amount || amount < 10) {
//     throw new Error("Minimum deposit is £10");
//   }

//   const yearMonth = new Date().toISOString().slice(0, 7);
//   const conn = await db.getConnection();

//   try {
//     await conn.beginTransaction();

//     /* --------------------------------
//        1️⃣ FETCH WALLET LIMIT ⭐
//     -------------------------------- */
//     const [[wallet]] = await conn.query(
//       `SELECT deposit_limit
//        FROM wallets
//        WHERE user_id = ?
//        FOR UPDATE`,
//       [userId]
//     );

//     if (!wallet) throw new Error("Wallet not found");

//     const MONTHLY_LIMIT = Number(wallet.deposit_limit);

//     if (!MONTHLY_LIMIT) {
//       throw new Error("Deposit limit not set");
//     }

//     /* --------------------------------
//        2️⃣ LOCK MONTHLY DEPOSIT ROW
//     -------------------------------- */
//     const [[row]] = await conn.query(
//       `SELECT total_added
//        FROM monthly_deposits
//        WHERE user_id = ? AND ym = ?
//        FOR UPDATE`,
//       [userId, yearMonth]
//     );

//     const alreadyAdded = row ? Number(row.total_added) : 0;
//     const remaining = MONTHLY_LIMIT - alreadyAdded;

//     if (remaining <= 0) {
//       throw new Error(`Monthly limit £${MONTHLY_LIMIT} reached`);
//     }

//     if (amount > remaining) {
//       throw new Error(
//         `You can add only £${remaining} more this month`
//       );
//     }

//     /* --------------------------------
//        3️⃣ UPDATE MONTHLY_DEPOSITS
//     -------------------------------- */
//     if (row) {
//       await conn.query(
//         `UPDATE monthly_deposits
//          SET total_added = total_added + ?
//          WHERE user_id = ? AND ym = ?`,
//         [amount, userId, yearMonth]
//       );
//     } else {
//       await conn.query(
//         `INSERT INTO monthly_deposits (user_id, ym, total_added)
//          VALUES (?, ?, ?)`,
//         [userId, yearMonth, amount]
//       );
//     }

//     /* --------------------------------
//        4️⃣ UPDATE USER WALLET
//     -------------------------------- */
//     await conn.query(
//       `UPDATE wallets
//        SET depositwallet = depositwallet + ?
//        WHERE user_id = ?`,
//       [amount, userId]
//     );

//     /* --------------------------------
//        5️⃣ COMPANY LEDGER TRANSACTION
//     -------------------------------- */
//     await createWalletTransaction({
//       conn,
//       userId,
//       wallettype: "deposit",
//       transtype: "credit",
//       amount,
//       remark: "User deposit",
//       referenceId: `DEP-${userId}-${Date.now()}`,
//       ip: meta.ip || null,
//       device: meta.device || null
//     });

//     await conn.commit();

//     return {
//       success: true,
//       added: amount,
//       monthlyLimit: MONTHLY_LIMIT,
//       addedThisMonth: alreadyAdded + amount,
//       remainingMonthlyLimit: remaining - amount
//     };

//   } catch (err) {
//     await conn.rollback();
//     throw err;
//   } finally {
//     conn.release();
//   }
// };



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

