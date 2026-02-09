import db from "../../config/db.js";

/**
 * 💰 ADD MONEY TO DEPOSIT WALLET
 * Rules:
 * - Min £10 per transaction
 * - Max £1000 per calendar month
 * - Wallet balance NEVER resets
 */

export const addDepositService = async (userId, amount) => {
  if (amount < 10) {
    throw new Error("Minimum deposit is 10 pounds");
  }

  const yearMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 🔒 Lock monthly row
    const [[row]] = await conn.query(
      `SELECT total_added
       FROM monthly_deposits
       WHERE user_id = ? AND ym = ?
       FOR UPDATE`,
      [userId, yearMonth]
    );

    const alreadyAdded = row ? Number(row.total_added) : 0;
    const remaining = 1000 - alreadyAdded;

    if (remaining <= 0) {
      throw new Error("Monthly deposit limit reached");
    }

    if (amount > remaining) {
      throw new Error(`You can add only ${remaining} pounds this month`);
    }

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

    await conn.query(
      `UPDATE wallets
       SET depositwallet = depositwallet + ?
       WHERE user_id = ?`,
      [amount, userId]
    );

    await conn.commit();

    return {
      added: amount,
      remainingMonthlyLimit: remaining - amount
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


/**
 * 🏆 DEDUCT MONEY FOR CONTEST JOIN
 * Priority:
 * BONUS (≤5%) → DEPOSIT → WITHDRAW
 */


export const deductForContestService = async (userId, entryFee) => {
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

    // 1️⃣ Bonus (max 5%)
    const maxBonus = +(entryFee * 0.05).toFixed(2);
    const bonusUsed = Math.min(wallet.bonusamount, maxBonus);
    remaining -= bonusUsed;

    // 2️⃣ Deposit
    const depositUsed = Math.min(wallet.depositwallet, remaining);
    remaining -= depositUsed;

    // 3️⃣ Withdraw
    const withdrawUsed = Math.min(wallet.earnwallet, remaining);
    remaining -= withdrawUsed;

    // ❌ Insufficient
    if (remaining > 0) {
      const total = wallet.depositwallet + wallet.earnwallet + wallet.bonusamount;
      return {
        allowed: false,
        eligibleTeams: Math.floor(total / entryFee)
      };
    }

    // Update wallets
    await conn.query(
      `UPDATE wallets
       SET bonusamount = bonusamount - ?,
           depositwallet = depositwallet - ?,
           earnwallet = earnwallet - ?
       WHERE user_id = ?`,
      [bonusUsed, depositUsed, withdrawUsed, userId]
    );

    await conn.commit();

    return {
      allowed: true,
      used: {
        bonusUsed,
        depositUsed,
        withdrawUsed
      }
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
    `SELECT 
        depositwallet,
        earnwallet,
        bonusamount
     FROM wallets
     WHERE user_id = ?`,
    [userId]
  );

  if (!wallet) {
    throw new Error("Wallet not found");
  }

  return {
  depositWallet: Number(wallet.depositwallet),
  withdrawWallet: Number(wallet.earnwallet),
  bonusWallet: Number(wallet.bonusamount)
};

};


  