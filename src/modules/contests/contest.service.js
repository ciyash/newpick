import db from "../../config/db.js";
import { createWalletTransaction } from "../wallet/wallet.service.js";


export const getAllContestsService = async () => {

  const [rows] = await db.query(`
    SELECT *
    FROM contest
    ORDER BY entry_fee ASC
  `);

  return rows.map(c => ({
    id: c.id,
    matchId: c.match_id,

    entryFee: Number(c.entry_fee),
    prizePool: Number(c.prize_pool),

    maxEntries: c.max_entries,
    minEntries: c.min_entries,
    currentEntries: c.current_entries,

    contestType: c.contest_type,
    isGuaranteed: c.is_guaranteed === 1,

    winnerPercentage: Number(c.winner_percentage),
    totalWinners: c.total_winners,

    firstPrize: Number(c.first_prize),
    prizeDistribution: c.prize_distribution,

    isCashback: c.is_cashback === 1,
    cashbackPercentage: Number(c.cashback_percentage),
    cashbackAmount: Number(c.cashback_amount),

    platformFeePercentage: Number(c.platform_fee_percentage),
    platformFeeAmount: Number(c.platform_fee_amount),

    status: c.status,
    createdAt: c.created_at
  }));
};


export const getContestsService = async (matchId) => {

  const [rows] = await db.query(`
    SELECT *
    FROM contest
    WHERE match_id = ?
    ORDER BY entry_fee DESC
  `, [matchId]);

  return rows.map(c => ({

    id: c.id,
    matchId: c.match_id,

    entryFee: Number(c.entry_fee),
    prizePool: Number(c.prize_pool),

    maxEntries: c.max_entries,
    minEntries: c.min_entries,
    currentEntries: c.current_entries,

    contestType: c.contest_type,
    isGuaranteed: c.is_guaranteed === 1,

    winnerPercentage: Number(c.winner_percentage),
    totalWinners: c.total_winners,

    firstPrize: Number(c.first_prize),
    prizeDistribution: c.prize_distribution,

    isCashback: c.is_cashback === 1,
    cashbackPercentage: Number(c.cashback_percentage),
    cashbackAmount: Number(c.cashback_amount),

    platformFeePercentage: Number(c.platform_fee_percentage),
    platformFeeAmount: Number(c.platform_fee_amount),

    status: c.status,
    createdAt: c.created_at,

    // 🔥 FIXED remaining spots (no negative)
    remainingSpots: Math.max(c.max_entries - c.current_entries, 0)

  }));
};



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



//  export const joinContestService = async (userId, amount, meta = {}) => {
//   const conn = await db.getConnection();

//   try {
//     await conn.beginTransaction();

//     const { contestId, userTeamId } = meta;

//     if (!contestId || !userTeamId) {
//       throw new Error("ContestId and TeamId required");
//     }

//     const teamIds = Array.isArray(userTeamId)
//       ? userTeamId
//       : [userTeamId];

//     /* ================= DUPLICATE CHECK ================= */

//     for (const teamId of teamIds) {
//       const [[already]] = await conn.query(
//         `SELECT id 
//          FROM contest_entries
//          WHERE contest_id = ?
//          AND user_id = ?
//          AND user_team_id = ?`,
//         [contestId, userId, teamId]
//       );

//       if (already) {
//         throw new Error(`Team ${teamId} already joined`);
//       }
//     }

//     const entryAmount = parseFloat(amount);
//     if (isNaN(entryAmount) || entryAmount < 0) {
//       throw new Error("Invalid contest amount");
//     }

//     const totalEntry = entryAmount * teamIds.length;

//     /* ================= FREE CONTEST ================= */

//     if (entryAmount === 0) {
//       for (const teamId of teamIds) {
//         await conn.query(
//           `INSERT INTO contest_entries
//            (contest_id, user_id, user_team_id, entry_fee, status)
//            VALUES (?, ?, ?, 0, 'joined')`,
//           [contestId, userId, teamId]
//         );

//         await conn.query(
//           `UPDATE contest
//            SET current_entries = current_entries + 1
//            WHERE id = ?`,
//           [contestId]
//         );
//       }

//       await conn.commit();

//       return {
//         success: true,
//         message: "Joined free contest successfully"
//       };
//     }

//     /* ================= WALLET LOCK ================= */

//     const [[wallet]] = await conn.query(
//       `SELECT depositwallet, earnwallet, bonusamount, is_frozen
//        FROM wallets
//        WHERE user_id = ?
//        FOR UPDATE`,
//       [userId]
//     );

//     if (!wallet) throw new Error("Wallet not found");
//     if (wallet.is_frozen === 1) throw new Error("Wallet frozen");

//     let remaining = totalEntry;

//     /* ================= BONUS (MAX 5%) ================= */

//     const maxBonusAllowed = Number((totalEntry * 0.05).toFixed(2));

//     const bonusUse = Math.min(
//       Number(wallet.bonusamount || 0),
//       maxBonusAllowed,
//       remaining
//     );

//     remaining -= bonusUse;

//     /* ================= EARN ================= */

//     const earnUse = Math.min(
//       Number(wallet.earnwallet || 0),
//       remaining
//     );

//     remaining -= earnUse;

//     /* ================= DEPOSIT ================= */

//     const depositUse = Math.min(
//       Number(wallet.depositwallet || 0),
//       remaining
//     );

//     remaining -= depositUse;

//     remaining = Number(remaining.toFixed(2));

//     if (remaining > 0) {
//       throw new Error("Insufficient balance");
//     }

//     /* ================= UPDATE WALLET ================= */

//     await conn.query(
//       `UPDATE wallets SET
//          bonusamount = bonusamount - ?,
//          earnwallet = earnwallet - ?,
//          depositwallet = depositwallet - ?
//        WHERE user_id = ?`,
//       [bonusUse, earnUse, depositUse, userId]
//     );

//     /* =====================================================
//        🧾 INSERT WALLET TRANSACTIONS (LEDGER ENTRIES)
//     ===================================================== */

//     const insertTxn = async (walletType, amountUsed) => {
//       if (amountUsed <= 0) return;

//       await conn.query(
//         `INSERT INTO wallet_transactions
//          (user_id, wallettype, transtype, amount, remark, reference_id)
//          VALUES (?, ?, 'debit', ?, ?, ?)`,
//         [
//           userId,
//           walletType,
//           amountUsed,
//           "Contest Join",
//           contestId
//         ]
//       );
//     };

//     await insertTxn("bonus", bonusUse);
//     await insertTxn("earn", earnUse);
//     await insertTxn("deposit", depositUse);

//     /* ================= INSERT ENTRIES ================= */

//     for (const teamId of teamIds) {
//       await conn.query(
//         `INSERT INTO contest_entries
//          (contest_id, user_id, user_team_id, entry_fee, status)
//          VALUES (?, ?, ?, ?, 'joined')`,
//         [contestId, userId, teamId, entryAmount]
//       );

//       await conn.query(
//         `UPDATE contest
//          SET current_entries = current_entries + 1
//          WHERE id = ?`,
//         [contestId]
//       );
//     }

//     await conn.commit();

//     return {
//       success: true,
//       message: "Contest joined successfully",
//       deduction: {
//         totalEntry,
//         bonusUsed: bonusUse,
//         earnUsed: earnUse,
//         depositUsed: depositUse
//       }
//     };

//   } catch (err) {
//     await conn.rollback();
//     throw err;
//   } finally {
//     conn.release();
//   }
// };

export const joinContestService = async (userId, amount, meta = {}) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const { contestId, userTeamId } = meta;

    if (!contestId || !userTeamId) {
      throw new Error("ContestId and TeamId required");
    }

    const teamIds = Array.isArray(userTeamId)
      ? userTeamId
      : [userTeamId];

    /* ================= DUPLICATE CHECK ================= */

    for (const teamId of teamIds) {
      const [[already]] = await conn.query(
        `SELECT id 
         FROM contest_entries
         WHERE contest_id = ?
         AND user_id = ?
         AND user_team_id = ?`,
        [contestId, userId, teamId]
      );

      if (already) {
        throw new Error(`Team ${teamId} already joined`);
      }
    }

    /* ================= CONTEST LOCK & CAPACITY CHECK ================= */

    const [[contest]] = await conn.query(
      `SELECT max_entries, current_entries, status
       FROM contest
       WHERE id = ?
       FOR UPDATE`,
      [contestId]
    );

    if (!contest) {
      throw new Error("Contest not found");
    }

    if (contest.status !== "UPCOMING") {
      throw new Error("Contest not available");
    }

    const totalTeamsToJoin = teamIds.length;

    if (contest.current_entries >= contest.max_entries) {
      throw new Error("Contest full");
    }

    if (contest.current_entries + totalTeamsToJoin > contest.max_entries) {
      throw new Error("Not enough spots left");
    }

    /* ================= ENTRY AMOUNT ================= */

    const entryAmount = parseFloat(amount);

    if (isNaN(entryAmount) || entryAmount < 0) {
      throw new Error("Invalid contest amount");
    }

    const totalEntry = entryAmount * totalTeamsToJoin;

    /* ================= FREE CONTEST ================= */

    if (entryAmount === 0) {

      for (const teamId of teamIds) {
        await conn.query(
          `INSERT INTO contest_entries
           (contest_id, user_id, user_team_id, entry_fee, status)
           VALUES (?, ?, ?, 0, 'joined')`,
          [contestId, userId, teamId]
        );
      }

      await conn.query(
        `UPDATE contest
         SET current_entries = current_entries + ?
         WHERE id = ?`,
        [totalTeamsToJoin, contestId]
      );

      await conn.commit();

      return {
        success: true,
        message: "Joined free contest successfully"
      };
    }

    /* ================= WALLET LOCK ================= */

    const [[wallet]] = await conn.query(
      `SELECT depositwallet, earnwallet, bonusamount, is_frozen
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );

    if (!wallet) throw new Error("Wallet not found");
    if (wallet.is_frozen === 1) throw new Error("Wallet frozen");

    let remaining = totalEntry;

    /* ================= BONUS (MAX 5%) ================= */

    const maxBonusAllowed = Number((totalEntry * 0.05).toFixed(2));

    const bonusUse = Math.min(
      Number(wallet.bonusamount || 0),
      maxBonusAllowed,
      remaining
    );

    remaining -= bonusUse;

    /* ================= EARN ================= */

    const earnUse = Math.min(
      Number(wallet.earnwallet || 0),
      remaining
    );

    remaining -= earnUse;

    /* ================= DEPOSIT ================= */

    const depositUse = Math.min(
      Number(wallet.depositwallet || 0),
      remaining
    );

    remaining -= depositUse;

    remaining = Number(remaining.toFixed(2));

    if (remaining > 0) {
      throw new Error("Insufficient balance");
    }

    /* ================= UPDATE WALLET ================= */

    await conn.query(
      `UPDATE wallets SET
         bonusamount = bonusamount - ?,
         earnwallet = earnwallet - ?,
         depositwallet = depositwallet - ?
       WHERE user_id = ?`,
      [bonusUse, earnUse, depositUse, userId]
    );

    /* ================= WALLET TRANSACTIONS ================= */

    const insertTxn = async (walletType, amountUsed) => {
      if (amountUsed <= 0) return;

      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, amount, remark, reference_id)
         VALUES (?, ?, 'debit', ?, ?, ?)`,
        [
          userId,
          walletType,
          amountUsed,
          "Contest Join",
          contestId
        ]
      );
    };

    await insertTxn("bonus", bonusUse);
    await insertTxn("earn", earnUse);
    await insertTxn("deposit", depositUse);

    /* ================= INSERT ENTRIES ================= */

    for (const teamId of teamIds) {
      await conn.query(
        `INSERT INTO contest_entries
         (contest_id, user_id, user_team_id, entry_fee, status)
         VALUES (?, ?, ?, ?, 'joined')`,
        [contestId, userId, teamId, entryAmount]
      );
    }

    /* ================= UPDATE CONTEST COUNT ================= */

    const newCount = contest.current_entries + totalTeamsToJoin;

    await conn.query(
      `UPDATE contest
       SET current_entries = ?
       WHERE id = ?`,
      [newCount, contestId]
    );

    /* ================= AUTO MARK FULL ================= */

    if (newCount >= contest.max_entries) {
      await conn.query(
        `UPDATE contest
         SET status = 'FULL'
         WHERE id = ?`,
        [contestId]
      );
    }

    await conn.commit();

    return {
      success: true,
      message: "Contest joined successfully",
      deduction: {
        totalEntry,
        bonusUsed: bonusUse,
        earnUsed: earnUse,
        depositUsed: depositUse
      }
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const getMyContestsService = async (userId, matchId) => {

  const [rows] = await db.query(`
    SELECT 
      c.id AS contest_id,
      c.match_id,
      c.entry_fee,
      c.prize_pool,
      c.max_entries,
      c.current_entries,
      c.contest_type,
      c.status,
      c.first_prize,
      c.total_winners

    FROM contest_entries ce
    JOIN contest c ON ce.contest_id = c.id

    WHERE ce.user_id = ?
    AND c.match_id = ?   -- ✅ filter by matchId

    GROUP BY c.id
    ORDER BY MAX(ce.id) DESC
  `, [userId, matchId]);

  return rows;
};

 

  