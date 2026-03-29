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


export const getContestsServiceold = async (matchId) => {

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
export const getContestsService = async (matchId, userId) => {
  try {

    if (!matchId) throw new Error("matchId is required");
    if (!userId) throw new Error("userId is required");

    const [rows] = await db.query(`
      SELECT 
        c.*,
        COUNT(ce.id) AS my_team_count
      FROM contest c
      LEFT JOIN contest_entries ce 
        ON ce.contest_id = c.id 
        AND ce.user_id = ?
      WHERE c.match_id = ?
      GROUP BY c.id
      ORDER BY c.entry_fee DESC
    `, [userId, matchId]);

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((c) => {

      const myTeamCount = Number(c.my_team_count) || 0;

      let prizeDistribution = null;
      try {
        prizeDistribution = c.prize_distribution
          ? JSON.parse(c.prize_distribution)
          : null;
      } catch {
        prizeDistribution = null;
      }

      const isCashback = c.is_cashback === 1;

      return {
        id: c.id,
        matchId: c.match_id,

        entryFee: Number(c.entry_fee) || 0,
        prizePool: Number(c.prize_pool) || 0,

        maxEntries: c.max_entries || 0,
        minEntries: c.min_entries || 0,
        currentEntries: c.current_entries || 0,
        remainingSpots: Math.max((c.max_entries || 0) - (c.current_entries || 0), 0),

        myTeamCount,
        isJoined: myTeamCount > 0,

        contestType: c.contest_type || null,
        isGuaranteed: c.is_guaranteed === 1,

        winnerPercentage: Number(c.winner_percentage) || 0,
        totalWinners: c.total_winners || 0,
        firstPrize: Number(c.first_prize) || 0,
        prizeDistribution,

        isCashback,
        ...(isCashback && {
          cashbackPercentage: Number(c.cashback_percentage) || 0,
          cashbackAmount: Number(c.cashback_amount) || 0
        }),

        platformFeePercentage: Number(c.platform_fee_percentage) || 0,
        platformFeeAmount: Number(c.platform_fee_amount) || 0,

        status: c.status || null,
        createdAt: c.created_at || null
      };

    });

  } catch (err) {
    console.error("[getContestsService]", err);
    throw err;
  }
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


// export const joinContestService = async (userId, amount, meta = {}) => {

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

//     /* ================= CONTEST + MATCH LOCK ================= */

//     const [[contest]] = await conn.query(
//       `SELECT
//           c.max_entries,
//           c.current_entries,
//           c.status,
//           m.status AS match_status,
//           m.matchdate,
//           m.start_time
//        FROM contest c
//        JOIN matches m ON c.match_id = m.id
//        WHERE c.id = ?
//        FOR UPDATE`,
//       [contestId]
//     );

//     if (!contest) {
//       throw new Error("Contest not found");
//     }

//     /* ---------- Match Status Check ---------- */

//     if (contest.match_status !== "UPCOMING") {
//       throw new Error("Match already started or completed");
//     }

//     /* ---------- Match Time Check ---------- */

//     const now = new Date();

//     const matchStart = new Date(
//       `${contest.matchdate.toISOString().split("T")[0]} ${contest.start_time}`
//     );

//     if (now >= matchStart) {
//       throw new Error("Match already started");
//     }

//     /* ---------- Contest Status Check ---------- */

//     if (contest.status !== "UPCOMING") {
//       throw new Error("Contest not available");
//     }

//     const totalTeamsToJoin = teamIds.length;

//     if (contest.current_entries >= contest.max_entries) {
//       throw new Error("Contest full");
//     }

//     if (contest.current_entries + totalTeamsToJoin > contest.max_entries) {
//       throw new Error("Not enough spots left");
//     }

//     /* ================= ENTRY AMOUNT ================= */

//     const entryAmount = parseFloat(amount);

//     if (isNaN(entryAmount) || entryAmount < 0) {
//       throw new Error("Invalid contest amount");
//     }

//     const totalEntry = entryAmount * totalTeamsToJoin;

//     /* ================= FREE CONTEST ================= */

//     if (entryAmount === 0) {

//       for (const teamId of teamIds) {

//         await conn.query(
//           `INSERT INTO contest_entries
//            (contest_id, user_id, user_team_id, entry_fee, status)
//            VALUES (?, ?, ?, 0, 'joined')`,
//           [contestId, userId, teamId]
//         );

//       }

//       await conn.query(
//         `UPDATE contest
//          SET current_entries = current_entries + ?
//          WHERE id = ?`,
//         [totalTeamsToJoin, contestId]
//       );

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

//     /* ================= WALLET TRANSACTIONS ================= */

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
//     await insertTxn("winning", earnUse);
//     await insertTxn("deposit", depositUse);

//     /* ================= INSERT ENTRIES ================= */

//     for (const teamId of teamIds) {

//       await conn.query(
//         `INSERT INTO contest_entries
//          (contest_id, user_id, user_team_id, entry_fee, status)
//          VALUES (?, ?, ?, ?, 'joined')`,
//         [contestId, userId, teamId, entryAmount]
//       );

//     }

//     /* ================= UPDATE CONTEST COUNT ================= */

//     const newCount = contest.current_entries + totalTeamsToJoin;

//     await conn.query(
//       `UPDATE contest
//        SET current_entries = ?
//        WHERE id = ?`,
//       [newCount, contestId]
//     );

//     /* ================= AUTO MARK FULL ================= */

//     if (newCount >= contest.max_entries) {

//       await conn.query(
//         `UPDATE contest
//          SET status = 'FULL'
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

    /* ================= CONTEST + MATCH LOCK ================= */

    const [[contest]] = await conn.query(
      `SELECT
          c.max_entries,
          c.current_entries,
          c.status,
          m.status AS match_status,
          m.matchdate,
          m.start_time
       FROM contest c
       JOIN matches m ON m.provider_match_id = c.match_id
       WHERE c.id = ?
       FOR UPDATE`,
      [contestId]
    );

    if (!contest) {
      throw new Error("Contest not found");
    }

    /* ---------- Match Status Check ---------- */

    if (contest.match_status !== "UPCOMING") {
      throw new Error("Match already started or completed");
    }

    /* ---------- Match Time Check ---------- */

    const now = new Date();

    const matchStart = new Date(
      `${contest.matchdate.toISOString().split("T")[0]} ${contest.start_time}`
    );

    if (now >= matchStart) {
      throw new Error("Match already started");
    }

    /* ---------- Contest Status Check ---------- */

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
    await insertTxn("winning", earnUse);
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
  try {

    if (!userId) throw new Error("userId is required");
    if (!matchId) throw new Error("matchId is required");

    // ✅ Step 1: get contests user joined
    const [contestRows] = await db.query(`
      SELECT 
        c.id                  AS contest_id,
        c.match_id,
        c.entry_fee,
        c.prize_pool,
        c.max_entries,
        c.current_entries,
        c.contest_type,
        c.status,
        c.first_prize,
        c.total_winners,
        c.winner_percentage,
        c.platform_fee_percentage,
        COUNT(ce.id)          AS my_team_count
      FROM contest_entries ce
      JOIN contest c ON ce.contest_id = c.id
      WHERE ce.user_id = ?
      AND c.match_id = ?
      GROUP BY c.id
      ORDER BY MAX(ce.id) DESC
    `, [userId, matchId]);

    if (!contestRows || contestRows.length === 0) return [];

    // ✅ Step 2: get all contest ids
    const contestIds = contestRows.map(c => c.contest_id);

    // ✅ Step 3: get all entries for these contests by this user
    const [entryRows] = await db.query(`
      SELECT
        ce.id             AS entry_id,
        ce.contest_id,
        ce.user_team_id,
        ce.entry_fee,
        ce.urank,
        ce.winning_amount,
        ce.status         AS entry_status,
        ce.joined_at
      FROM contest_entries ce
      WHERE ce.user_id = ?
      AND ce.contest_id IN (?)
    `, [userId, contestIds]);

    // ✅ Step 4: get all team ids from entries
    const allTeamIds = [...new Set(
      entryRows
        .map(e => e.user_team_id)
        .filter(Boolean)
    )];

    // ✅ Step 5: fetch all teams + players in one query
    let teamsMap = {};

    if (allTeamIds.length > 0) {

      const [teamRows] = await db.query(`
        SELECT
          ut.id               AS team_id,
          ut.team_name,
          ut.team_rank,
          ut.locked,
          ut.created_at,
          utp.id              AS player_entry_id,
          utp.player_id,
          utp.is_captain,
          utp.is_vice_captain,
          utp.points,
          utp.role,
          utp.is_substitude
        FROM user_teams ut
        LEFT JOIN user_team_players utp ON utp.user_team_id = ut.id
        WHERE ut.id IN (?)
        AND ut.user_id = ?
      `, [allTeamIds, userId]);

      // ✅ Step 6: group players under their team
      teamRows.forEach((row) => {
        if (!teamsMap[row.team_id]) {
          teamsMap[row.team_id] = {
            teamId:   row.team_id,
            teamName: row.team_name  || null,
            teamRank: row.team_rank  || null,
            locked:   row.locked === 1,
            createdAt: row.created_at || null,
            players:  []
          };
        }

        if (row.player_entry_id) {
          teamsMap[row.team_id].players.push({
            playerEntryId:  row.player_entry_id,
            playerId:       row.player_id,
            role:           row.role            || null,
            isCaptain:      row.is_captain      === 1,
            isViceCaptain:  row.is_vice_captain === 1,
            isSubstitute:   row.is_substitude   === 1,
            points:         Number(row.points)  || 0
          });
        }
      });
    }

    // ✅ Step 7: group entries under their contest
    const entriesByContest = {};
    entryRows.forEach((e) => {
      if (!entriesByContest[e.contest_id]) {
        entriesByContest[e.contest_id] = [];
      }
      entriesByContest[e.contest_id].push(e);
    });

    // ✅ Step 8: build final response
    return contestRows.map((c) => {

      const entries = entriesByContest[c.contest_id] || [];

      const teams = entries.map((e) => {
        const team = teamsMap[e.user_team_id] || null;
        return {
          entryId:       e.entry_id,
          entryFee:      Number(e.entry_fee)      || 0,
          urank:         e.urank                  || null,
          winningAmount: Number(e.winning_amount) || 0,
          entryStatus:   e.entry_status           || null,
          joinedAt:      e.joined_at              || null,
          ...(team || {
            teamId:    null,
            teamName:  null,
            teamRank:  null,
            locked:    null,
            createdAt: null,
            players:   []
          })
        };
      });

      return {
        contest_id:             c.contest_id,
        match_id:               c.match_id,

        entry_fee:              Number(c.entry_fee)              || 0,
        prize_pool:             Number(c.prize_pool)             || 0,

        max_entries:            c.max_entries                    || 0,
        current_entries:        c.current_entries                || 0,
        remainingSpots:        Math.max((c.max_entries || 0) - (c.current_entries || 0), 0),

        contest_type:           c.contest_type                   || null,
        status:                c.status                         || null,

        first_prize:            Number(c.first_prize)            || 0,
        total_winners:          c.total_winners                  || 0,
        winner_percentage:      Number(c.winner_percentage)      || 0,
        platform_fee_percentage: Number(c.platform_fee_percentage)|| 0,

        myTeamCount:           Number(c.my_team_count)          || 0,

        // ✅ teams with entry details + players
        teams
      };
    });

  } catch (err) {
    console.error("[getMyContestsService]", err);
    throw err;
  }
};

export const getMyJoinedContestsService = async (
  userId,
  matchId,
  contestId = null
) => {
  try {

    if (!userId) throw new Error("userId is required");
    if (!matchId) throw new Error("matchId is required");

    let query = `
      SELECT 
        c.id                  AS contest_id,
        c.match_id,
        c.entry_fee,
        c.prize_pool,
        c.max_entries,
        c.current_entries,
        c.contest_type,
        c.status,
        c.first_prize,
        c.total_winners,
        c.winner_percentage,
        c.platform_fee_percentage,
        COUNT(ce.id)          AS my_team_count
      FROM contest_entries ce
      JOIN contest c ON ce.contest_id = c.id
      WHERE ce.user_id = ?
      AND c.match_id = ?
    `;

    const params = [userId, matchId];

    if (contestId) {
      query += ` AND c.id = ?`;
      params.push(contestId);
    }

    query += `
      GROUP BY c.id
      ORDER BY MAX(ce.id) DESC
    `;

    const [rows] = await db.query(query, params);

    if (!rows || rows.length === 0) {
      return [];
    }

    return rows.map((c) => ({
      contest_id: c.contest_id,
      match_id: c.match_id,

      entry_fee: Number(c.entry_fee) || 0,
      prize_pool: Number(c.prize_pool) || 0,

      max_entries: c.max_entries || 0,
      current_entries: c.current_entries || 0,
      remainingSpots: Math.max((c.max_entries || 0) - (c.current_entries || 0), 0),

      contest_type: c.contest_type || null,
      status: c.status || null,

      first_prize: Number(c.first_prize) || 0,
      total_winners: c.total_winners || 0,
      winner_percentage: Number(c.winner_percentage) || 0,
      platform_fee_percentage: Number(c.platform_fee_percentage) || 0,

      // ✅ user joined teams count
      myTeamCount: Number(c.my_team_count) || 0

    }));

  } catch (err) {
    console.error("[getMyJoinedContestsService]", err);
    throw err;
  }
};
    