import db from "../../config/db.js";
import { createWalletTransaction } from "../wallet/wallet.service.js";
import { calculateTeamPoints } from "../scoring/scoring.engine.js";       // ✅
import { fetchPlayerStats } from "../scoring/scoring.service.js";   


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

    if (!rows || rows.length === 0) return [];

    return rows.map((c) => {
      let prizeDistribution = null;
      try {
        prizeDistribution = c.prize_distribution
          ? JSON.parse(c.prize_distribution)
          : null;
      } catch {
        prizeDistribution = null;
      }

      const isCashback = c.is_cashback === 1;
      const myTeamCount = Number(c.my_team_count) || 0;

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
          cashbackAmount: Number(c.cashback_amount) || 0,
        }),

        platformFeePercentage: Number(c.platform_fee_percentage) || 0,
        platformFeeAmount: Number(c.platform_fee_amount) || 0,

        status: c.status || null,
        createdAt: c.created_at || null,
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
//        JOIN matches m ON m.id = c.match_id
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

    /* ================= FREE CONTEST TEAM LIMIT CHECK ================= */

    const [[contestCheck]] = await conn.query(
      `SELECT entry_fee FROM contest WHERE id = ?`,
      [contestId]
    );

    if (contestCheck && parseFloat(contestCheck.entry_fee) === 0) {

      const [[user]] = await conn.query(
        `SELECT subscribe FROM users WHERE id = ?`,
        [userId]
      );

      if (!user?.subscribe) {

        const [[{ joinedCount }]] = await conn.query(
          `SELECT COUNT(*) as joinedCount
           FROM contest_entries
           WHERE contest_id = ? AND user_id = ?`,
          [contestId, userId]
        );

        if (joinedCount + teamIds.length > 1) {
          throw new Error("Free contest allows only 1 team for non-subscribers");
        }

      }
      // ✅ Subscriber — no limit
    }
    // ✅ LITE, MEGA, ULTRA — no restriction

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
       JOIN matches m ON m.id = c.match_id
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

};//

export const getMyContestsService = async (userId, matchId) => {
  try {
    if (!userId) throw new Error("userId is required");
    if (!matchId) throw new Error("matchId is required");

    // Step 1: get contests user joined
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

    const contestIds = contestRows.map(c => c.contest_id);

    // Step 2: get all entries
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

    const allTeamIds = [...new Set(
      entryRows.map(e => e.user_team_id).filter(Boolean)
    )];

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
          utp.is_substitude,
          p.name              AS player_name,
          p.playerimage       AS player_image,
          p.position,
          p.playercredits,
          p.points            AS player_points,
          p.flag_image,
          p.country,
          t.short_name        AS real_team_short_name
        FROM user_teams ut
        LEFT JOIN user_team_players utp ON utp.user_team_id = ut.id
        LEFT JOIN players p ON p.id = utp.player_id
        LEFT JOIN teams t ON t.id = p.team_id
        WHERE ut.id IN (?)
        AND ut.user_id = ?
      `, [allTeamIds, userId]);

      teamRows.forEach((row) => {
        if (!teamsMap[row.team_id]) {
          teamsMap[row.team_id] = {
            teamId:       row.team_id,
            teamName:     row.team_name  || null,
            teamRank:     row.team_rank  || null,
            locked:       row.locked === 1,
            createdAt:    row.created_at || null,
            totalPoints:  0,
            totalCredits: 0,
            creditsLeft:  100,
            players:      []
          };
        }

        if (row.player_entry_id) {
          const credits = parseFloat(row.playercredits) || 0;
          const points  = parseFloat(row.player_points) || 0;

          teamsMap[row.team_id].players.push({
            playerEntryId:      row.player_entry_id,
            playerId:           row.player_id,
            playerName:         row.player_name         || null,
            playerImage:        row.player_image        || null,
            position:           row.position            || null,
            credits:            credits,                          // ✅ player credits
            flagImage:          row.flag_image          || null,
            country:            row.country             || null,
            realTeamShortName:  row.real_team_short_name || null, // ✅ added
            role:               row.role                || null,
            isCaptain:          row.is_captain      === 1,
            isViceCaptain:      row.is_vice_captain === 1,
            isSubstitute:       row.is_substitude   === 1,
            points:             points                            // ✅ player points
          });

          // ✅ team totals accumulate
          teamsMap[row.team_id].totalPoints  += points;
          teamsMap[row.team_id].totalCredits += credits;
        }
      });

      // ✅ toFixed after all players processed
      Object.values(teamsMap).forEach(team => {
        team.totalPoints  = parseFloat(team.totalPoints.toFixed(2));
        team.totalCredits = parseFloat(team.totalCredits.toFixed(2));
        team.creditsLeft  = parseFloat((100 - team.totalCredits).toFixed(2));
      });
    }

    const entriesByContest = {};
    entryRows.forEach((e) => {
      if (!entriesByContest[e.contest_id]) {
        entriesByContest[e.contest_id] = [];
      }
      entriesByContest[e.contest_id].push(e);
    });

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
            teamId:       null,
            teamName:     null,
            teamRank:     null,
            locked:       null,
            createdAt:    null,
            totalPoints:  0,
            totalCredits: 0,
            creditsLeft:  100,
            players:      []
          })
        };
      });

      return {
        contest_id:              c.contest_id,
        match_id:                c.match_id,
        entry_fee:               Number(c.entry_fee)               || 0,
        prize_pool:              Number(c.prize_pool)              || 0,
        max_entries:             c.max_entries                     || 0,
        current_entries:         c.current_entries                 || 0,
        remainingSpots:          Math.max((c.max_entries || 0) - (c.current_entries || 0), 0),
        contest_type:            c.contest_type                    || null,
        status:                  c.status                         || null,
        first_prize:             Number(c.first_prize)             || 0,
        total_winners:           c.total_winners                   || 0,
        winner_percentage:       Number(c.winner_percentage)       || 0,
        platform_fee_percentage: Number(c.platform_fee_percentage) || 0,
        myTeamCount:             Number(c.my_team_count)           || 0,
        teams
      };
    });

  } catch (err) {
    console.error("[getMyContestsService]", err);
    throw err;
  }
};

/* ══════════════════════════════════════════
   HELPER — prize amount for a given rank
══════════════════════════════════════════ */
const getPrizeForRank = (rank, prizeDistribution, firstPrize) => {
  if (!prizeDistribution) return 0;

  let distribution;
  try {
    distribution = typeof prizeDistribution === "string"
      ? JSON.parse(prizeDistribution)
      : prizeDistribution;
  } catch {
    return 0;
  }

  // prize_distribution format:
  // [{ rank_from: 1, rank_to: 1, amount: 3000000 }, { rank_from: 2, rank_to: 5, amount: 10000 }, ...]
  for (const tier of distribution) {
    if (rank >= tier.rank_from && rank <= tier.rank_to) {
      return tier.amount || 0;
    }
  }
  return 0;
};

/* ══════════════════════════════════════════
   HELPER — calculate user team total points
   from player_match_stats via user_team_players
══════════════════════════════════════════ */


const calcTeamPoints = async (userTeamId, matchId) => {
  const [rows] = await db.query(
    `SELECT 
       SUM(pms.fantasy_points) AS total_points
     FROM user_team_players utp
     JOIN player_match_stats pms 
       ON pms.player_id = utp.player_id 
      AND pms.match_id = ?
     WHERE utp.user_team_id = ?`,
    [matchId, userTeamId]
  );
  return parseFloat(rows[0]?.total_points || 0);
};

/* ══════════════════════════════════════════
   LEADERBOARD SERVICE
══════════════════════════════════════════ */




// export const getLeaderboardService = async (contestId, page = 1, limit = 50) => {
//   const offset = (page - 1) * limit;

//   // Step 1: Contest info
//   const [[contest]] = await db.query(
//     `SELECT c.id, c.match_id, c.prize_pool, c.first_prize,
//             c.prize_distribution, c.current_entries,
//             c.entry_fee, c.status, c.contest_type,
//             c.total_winners, c.net_pool_prize
//      FROM contest c WHERE c.id = ?`,
//     [contestId]
//   );

//   if (!contest)
//     return { success: false, message: "Contest not found" };

//   // Step 2: All entries with user info (paginated)
//   const [entries] = await db.query(
//     `SELECT 
//        ce.id,
//        ce.user_id,
//        ce.user_team_id,
//        ce.urank,
//        ce.winning_amount,
//        ce.status,
//        u.name,
//        u.nickname,
//        u.image
//      FROM contest_entries ce
//      JOIN users u ON u.id = ce.user_id
//      WHERE ce.contest_id = ?
//      ORDER BY ce.urank ASC
//      LIMIT ? OFFSET ?`,
//     [contestId, limit, offset]
//   );

//   // Step 3: Total count for pagination
//   const [[{ total }]] = await db.query(
//     `SELECT COUNT(*) as total FROM contest_entries WHERE contest_id = ?`,
//     [contestId]
//   );

//   // Step 4: ✅ Batch fetch all team points in ONE query (fixes N+1)
//   const teamIds = entries.map(e => e.user_team_id).filter(Boolean);

//   let pointsMap = {};

//   if (teamIds.length > 0) {
//     const [pointsRows] = await db.query(
//       `SELECT 
//          utp.user_team_id,
//          SUM(pms.fantasy_points) AS total_points
//        FROM user_team_players utp
//        JOIN player_match_stats pms 
//          ON pms.player_id = utp.player_id 
//         AND pms.match_id = ?
//        WHERE utp.user_team_id IN (?)
//        GROUP BY utp.user_team_id`,
//       [contest.match_id, teamIds]
//     );

//     pointsRows.forEach(r => {
//       pointsMap[r.user_team_id] = parseFloat(r.total_points || 0);
//     });
//   }

//   // Step 5: Build leaderboard rows
//   const leaderboard = entries.map((entry) => {
//     const points = pointsMap[entry.user_team_id] || 0;
//     const prize  = entry.winning_amount ||
//                    getPrizeForRank(entry.urank, contest.prize_distribution, contest.first_prize);

//     return {
//       rank:           entry.urank,
//       user_id:        entry.user_id,
//       username:       entry.nickname || entry.name || "User" + entry.user_id,
//       profile_image:  entry.image || null,
//       user_team_id:   entry.user_team_id,
//       points,
//       winning_amount: prize,
//       is_winner:      prize > 0,
//     };
//   });

//   // Step 6: Prize tiers for frontend
//   let prizeTiers = [];
//   try {
//     prizeTiers = typeof contest.prize_distribution === "string"
//       ? JSON.parse(contest.prize_distribution)
//       : contest.prize_distribution || [];
//   } catch {
//     prizeTiers = [];
//   }

//   return {
//     success: true,
//     contest: {
//       id:             contest.id,
//       prize_pool:     contest.prize_pool,
//       net_pool_prize: contest.net_pool_prize,
//       first_prize:    contest.first_prize,
//       entry_fee:      contest.entry_fee,
//       total_entries:  contest.current_entries,
//       total_winners:  contest.total_winners,
//       contest_type:   contest.contest_type,
//       status:         contest.status,
//       prize_tiers:    prizeTiers,
//     },
//     leaderboard,
//     pagination: {
//       current_page:  page,
//       per_page:      limit,
//       total_entries: parseInt(total),
//       total_pages:   Math.ceil(total / limit),
//       has_more:      offset + limit < total,
//     },
//   };
// };

/* ══════════════════════════════════════════
   MY RANK SERVICE — specific user position
══════════════════════════════════════════ */



export const getMyRankService = async (contestId, userId, userTeamId) => {
  const [[contest]] = await db.query(
    `SELECT id, match_id, prize_pool, first_prize,
            prize_distribution, current_entries, status
     FROM contest c WHERE c.id = ?`,
    [contestId]
  );

  if (!contest)
    return { success: false, message: "Contest not found" };

  // ✅ specific team మాత్రమే fetch చేస్తాం

  const [[entry]] = await db.query(
    `SELECT 
       ce.id,
       ce.user_team_id,        
       ce.urank,
       ce.winning_amount,
       u.name,
       u.nickname,
       u.image
     FROM contest_entries ce
     JOIN users u ON u.id = ce.user_id
     WHERE ce.contest_id = ? AND ce.user_id = ? AND ce.user_team_id = ?`,  
    [contestId, userId, userTeamId]
  );

 

  if (!entry)
    return { success: false, message: "This team not found in contest" };

   const points = await calcTeamPoints(entry.user_team_id, contest.match_id);
  const prize  = entry.winning_amount ||
                 getPrizeForRank(entry.urank, contest.prize_distribution, contest.first_prize);

  return {
    success:        true,
    user_id:        parseInt(userId),
    username:       entry.nickname || entry.name || "User" + userId,
    profile_image:  entry.image || null,
     user_team_id: entry.user_team_id,  
    rank:           entry.urank,
    points:         points,
    winning_amount: prize,
    is_winner:      prize > 0,
    total_entries:  contest.current_entries,
  };
};  


// ─────────────────────────────────────────────
// GET SCORE BREAKDOWN SERVICE (single entry)
// ─────────────────────────────────────────────
export const getScoreBreakdownService = async (contestId, userTeamId, matchId) => {
  if (!contestId || !userTeamId || !matchId)
    throw new Error("contestId, userTeamId, matchId are required");

  // Fetch team players
  const [teamPlayers] = await db.query(
    `SELECT
       utp.player_id     AS playerId,
       utp.is_captain    AS isCaptain,
       utp.is_vice_captain AS isViceCaptain,
       p.name,
       p.position,
       p.playerimage     AS image
     FROM user_team_players utp
     JOIN players p ON p.id = utp.player_id
     WHERE utp.user_team_id = ?`,
    [userTeamId]
  );

  if (!teamPlayers.length) throw new Error("Team not found");

  const playerIds   = teamPlayers.map((p) => p.playerId);
  const allStats    = await fetchPlayerStats(matchId, playerIds);
  const statsMap    = {};
  allStats.forEach((s) => { statsMap[s.playerId] = s; });

  const captainId    = teamPlayers.find((p) => p.isCaptain)?.playerId    || null;
  const viceCaptainId= teamPlayers.find((p) => p.isViceCaptain)?.playerId || null;

  const playerStatsList = teamPlayers
    .map((p) => statsMap[p.playerId])
    .filter(Boolean);

  const result = calculateTeamPoints(playerStatsList, captainId, viceCaptainId);

  // Merge player info with score breakdown
  const playersWithInfo = result.players.map((scored) => {
    const info = teamPlayers.find((p) => p.playerId === scored.playerId) || {};
    return {
      playerId:     scored.playerId,
      name:         info.name     || null,
      image:        info.image    || null,
      position:     info.position || null,
      isCaptain:    info.isCaptain    === 1,
      isViceCaptain:info.isViceCaptain === 1,
      basePoints:   scored.basePoints,
      finalPoints:  scored.finalPoints,
      breakdown:    scored.breakdown,
    };
  });

  return {
    success:    true,
    userTeamId,
    teamTotal:  result.teamTotal,
    players:    playersWithInfo,
  };
};

//=================================================================================================//




// ─────────────────────────────────────────────────────────────────────────────
// ADD THIS to contest.service.js
// ─────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════
// WINNINGS SERVICE — Prize pool breakdown for a contest
// Used by the "Winnings" tab in the leaderboard screen
// ══════════════════════════════════════════════════════

export const getContestWinningsService = async (contestId) => {
  const [[contest]] = await db.query(
    `SELECT 
       c.id, c.prize_pool, c.first_prize,
       c.prize_distribution, c.current_entries,
       c.max_entries, c.entry_fee, c.status,
       c.contest_type, c.total_winners,
       c.winner_percentage, c.net_pool_prize,
       c.is_guaranteed, c.min_entries
     FROM contest c
     JOIN matches m ON m.id = c.match_id
     WHERE c.id = ?`,
    [contestId]
  );

  if (!contest)
    throw Object.assign(new Error("Contest not found"), { statusCode: 404 });

  let prizeTiers = [];
  try {
    prizeTiers = typeof contest.prize_distribution === "string"
      ? JSON.parse(contest.prize_distribution)
      : contest.prize_distribution || [];
  } catch {
    prizeTiers = [];
  }

  return {
    success: true,
    contest: {
      id:                contest.id,
      prize_pool:        Number(contest.prize_pool)        || 0,
      net_pool_prize:    Number(contest.net_pool_prize)    || 0,
      first_prize:       Number(contest.first_prize)       || 0,
      entry_fee:         Number(contest.entry_fee)         || 0,
      total_spots:       contest.max_entries               || 0,
      current_entries:   contest.current_entries           || 0,
      total_winners:     contest.total_winners             || 0,
      winner_percentage: Number(contest.winner_percentage) || 0,
      contest_type:      contest.contest_type              || null,
      status:            contest.status                    || null,
      is_guaranteed:     contest.is_guaranteed === 1,
      min_entries:       contest.min_entries               || 0,
    },
    prize_tiers: prizeTiers,  // [{ rank_from, rank_to, amount }]
  };
};

// ══════════════════════════════════════════════════════
// FIXED getLeaderboardService — includes my_entry block
// Replace the existing getLeaderboardService with this
// ══════════════════════════════════════════════════════
export const getLeaderboardService = async (contestId, userId, page = 1, limit = 50) => {
  const offset = (page - 1) * limit;

  // Step 1: Contest info + current_over for the "last updated" banner
  const [[contest]] = await db.query(
    `SELECT c.id, c.match_id, c.prize_pool, c.first_prize,
            c.prize_distribution, c.current_entries,
            c.entry_fee, c.status, c.contest_type,
            c.total_winners, c.net_pool_prize,
            m.current_over, m.last_updated_at
     FROM contest c
     JOIN matches m ON m.id = c.match_id
     WHERE c.id = ?`,
    [contestId]
  );

  if (!contest)
    return { success: false, message: "Contest not found" };

  // Step 2: All entries with user info (paginated, ordered by urank)
  const [entries] = await db.query(
    `SELECT 
       ce.id,
       ce.user_id,
       ce.user_team_id,
       ce.urank,
       ce.winning_amount,
       ce.status,
       u.name,
       u.nickname,
       u.image
     FROM contest_entries ce
     JOIN users u ON u.id = ce.user_id
     WHERE ce.contest_id = ?
     ORDER BY ce.urank ASC
     LIMIT ? OFFSET ?`,
    [contestId, limit, offset]
  );

  // Step 3: Total count
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) as total FROM contest_entries WHERE contest_id = ?`,
    [contestId]
  );

  // Step 4: Batch fetch all team points (N+1 fix)
  const teamIds = entries.map(e => e.user_team_id).filter(Boolean);
  let pointsMap = {};

  if (teamIds.length > 0) {
    const [pointsRows] = await db.query(
      `SELECT 
         utp.user_team_id,
         SUM(pms.fantasy_points) AS total_points
       FROM user_team_players utp
       JOIN player_match_stats pms 
         ON pms.player_id = utp.player_id 
        AND pms.match_id = ?
       WHERE utp.user_team_id IN (?)
       GROUP BY utp.user_team_id`,
      [contest.match_id, teamIds]
    );
    pointsRows.forEach(r => {
      pointsMap[r.user_team_id] = parseFloat(r.total_points || 0);
    });
  }

  // Step 5: Build leaderboard rows
  const leaderboard = entries.map((entry) => {
    const points = pointsMap[entry.user_team_id] || 0;
    const prize  = entry.winning_amount ||
                   getPrizeForRank(entry.urank, contest.prize_distribution, contest.first_prize);
    return {
      rank:           entry.urank,
      user_id:        entry.user_id,
      username:       entry.nickname || entry.name || "User" + entry.user_id,
      profile_image:  entry.image || null,
      user_team_id:   entry.user_team_id,
      points,
      winning_amount: prize,
      is_winner:      prize > 0,
      is_me:          userId ? entry.user_id === parseInt(userId) : false,
    };
  });

  // Step 6: Fetch current user's OWN entry (for the top "my rank" card)
  let my_entry = null;
  if (userId) {
    const [myEntries] = await db.query(
      `SELECT 
         ce.user_team_id,
         ce.urank,
         ce.winning_amount,
         ut.team_name
       FROM contest_entries ce
       LEFT JOIN user_teams ut ON ut.id = ce.user_team_id
       WHERE ce.contest_id = ? AND ce.user_id = ?
       ORDER BY ce.urank ASC
       LIMIT 1`,
      [contestId, userId]
    );

    if (myEntries.length > 0) {
      const me = myEntries[0];
      const myPoints = pointsMap[me.user_team_id] || 
                       await calcTeamPoints(me.user_team_id, contest.match_id);
      const myPrize  = me.winning_amount ||
                       getPrizeForRank(me.urank, contest.prize_distribution, contest.first_prize);
      my_entry = {
        user_team_id:   me.user_team_id,
        team_name:      me.team_name || null,
        rank:           me.urank,
        points:         myPoints,
        winning_amount: myPrize,
        is_winner:      myPrize > 0,
      };
    }
  }

  // Step 7: Prize tiers for the Winnings tab
  let prizeTiers = [];
  try {
    prizeTiers = typeof contest.prize_distribution === "string"
      ? JSON.parse(contest.prize_distribution)
      : contest.prize_distribution || [];
  } catch {
    prizeTiers = [];
  }

  return {
    success: true,
    contest: {
      id:             contest.id,
      prize_pool:     contest.prize_pool,
      net_pool_prize: contest.net_pool_prize,
      first_prize:    contest.first_prize,
      entry_fee:      contest.entry_fee,
      total_entries:  contest.current_entries,
      total_winners:  contest.total_winners,
      contest_type:   contest.contest_type,
      status:         contest.status,
      prize_tiers:    prizeTiers,
      // For "Points last updated at X.X overs" banner
      current_over:   contest.current_over   || null,
      last_updated_at:contest.last_updated_at|| null,
    },
    my_entry,       // ← highlighted card at top of leaderboard screen
    leaderboard,
    pagination: {
      current_page:  page,
      per_page:      limit,
      total_entries: parseInt(total),
      total_pages:   Math.ceil(total / limit),
      has_more:      offset + limit < total,
    },
  };
};