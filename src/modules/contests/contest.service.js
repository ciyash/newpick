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
    name: c.name,
    entryFee: Number(c.entry_fee),
    prizePool: Number(c.prize_pool),
    totalSpots: c.total_spots,
    filledSpots: c.filled_spots,
    firstPrize: Number(c.first_prize),
    status: c.status,
    createdAt: c.created_at
  }));
};


export const getContestsService = async (matchId = null) => {
  let query = `
    SELECT *
    FROM contest
    WHERE status = 'active'
  `;

  const params = [];

  if (matchId) {
    query += " AND match_id = ?";
    params.push(matchId);
  }

  query += " ORDER BY entry_fee ASC";

  const [rows] = await db.query(query, params);

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
    totalWinners: c.total_winners,
    status: c.status,
    createdAt: c.created_at
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





export const joinContestService = async (userId, contestId, userTeamId) => {
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

    if (contest.current_entries >= contest.max_entries) {
      throw new Error("Contest full");
    }

    // 🛑 Already joined check
    const [[already]] = await conn.execute(
      `SELECT id FROM contest_entries
       WHERE contest_id = ? AND user_id = ?`,
      [contestId, userId]
    );

    if (already) throw new Error("Already joined");

    // 💰 🔥 ENTRY FEE DEDUCTION (BONUS → WINNING → DEPOSIT)
    await deductForContestService(
      userId,
      contest.entry_fee,
      { ip: null, device: "mobile" }
    );

    // 🧑 Insert entry
    await conn.execute(
      `INSERT INTO contest_entries
      (contest_id, user_id, user_team_id, entry_fee, status)
      VALUES (?, ?, ?, ?, 'joined')`,
      [contestId, userId, userTeamId, contest.entry_fee]
    );

    // 🔢 Increase filled spots
    await conn.execute(
      `UPDATE contest
       SET current_entries = current_entries + 1
       WHERE id = ?`,
      [contestId]
    );

    await conn.commit();

    return {
      success: true,
      message: "Contest joined successfully"
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};
;



