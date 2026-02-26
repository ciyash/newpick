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
    ORDER BY entry_fee ASC
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

    // 🔥 EXTRA useful field
    remainingSpots: c.max_entries - c.current_entries
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



export const joinContestService = async (userId, contestId, userTeamIds) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 🔎 Contest details
    const [[contest]] = await conn.execute(
      `SELECT * FROM contest WHERE id = ? FOR UPDATE`,
      [contestId]
    );

    if (!contest) throw new Error("Contest not found");

    if (contest.status !== "UPCOMING") {
      throw new Error("Contest not open");
    }

    // 🧠 Remaining spots check
    const remainingSpots = contest.max_entries - contest.current_entries;

    if (userTeamIds.length > remainingSpots) {
      throw new Error("Not enough spots available");
    }

    // 🛑 Already joined check (same contest + same team)
    const [already] = await conn.execute(
      `SELECT user_team_id FROM contest_entries
       WHERE contest_id = ? AND user_id = ?`,
      [contestId, userId]
    );

    const alreadyTeamIds = already.map(r => r.user_team_id);

    for (const teamId of userTeamIds) {
      if (alreadyTeamIds.includes(teamId)) {
        throw new Error(`Team ${teamId} already joined`);
      }
    }

    // 💰 TOTAL ENTRY FEE (teams count × entry fee)
    const totalFee = contest.entry_fee * userTeamIds.length;

    await deductForContestService(
      userId,
      totalFee,
      { ip: null, device: "mobile" }
    );

    // 🧑 Insert entries for each team
    for (const teamId of userTeamIds) {
      await conn.execute(
        `INSERT INTO contest_entries
        (contest_id, user_id, user_team_id, entry_fee, status)
        VALUES (?, ?, ?, ?, 'joined')`,
        [contestId, userId, teamId, contest.entry_fee]
      );
    }

    // 🔢 Increase filled spots
    await conn.execute(
      `UPDATE contest
       SET current_entries = current_entries + ?
       WHERE id = ?`,
      [userTeamIds.length, contestId]
    );

    await conn.commit();

    return {
      success: true,
      message: `${userTeamIds.length} team(s) joined successfully`
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};



