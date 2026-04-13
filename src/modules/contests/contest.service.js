import db from "../../config/db.js";
import { createWalletTransaction } from "../wallet/wallet.service.js";
import { calculateTeamPoints }     from "../scoring/scoring.engine.js";
import { fetchPlayerStats }        from "../scoring/scoring.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const BONUS_MAX_PCT = 0.05; // max 5% of entry fee from bonus wallet

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — Prize for a given rank (Pick2Win 3-zone model)
//
// Zone 1 — Bonus   : rank 1 → (refundStart - 1)   → amount from prize_distribution tier
// Zone 2 — Refund  : rank refundStart → totalWinners → entry_fee exactly
// Zone 3 — No prize: rank > totalWinners              → 0
//
// prize_distribution stores ONLY the bonus-zone tiers:
//   [{ rank_from, rank_to, amount }, ...]
// ─────────────────────────────────────────────────────────────────────────────

const getPrizeForRank = (rank, prizeDistribution, entryFee, totalWinners, refundStartRank) => {
  if (!rank || rank <= 0) return 0;

  // Zone 3 — no prize
  if (rank > totalWinners) return 0;

  // Zone 2 — refund block
  if (rank >= refundStartRank) return Number(entryFee) || 0;

  // Zone 1 — bonus block: look up tier
  if (!prizeDistribution) return 0;

  let tiers;
  try {
    tiers = typeof prizeDistribution === "string"
      ? JSON.parse(prizeDistribution)
      : prizeDistribution;
  } catch {
    return 0;
  }

  const tier = tiers.find(t => rank >= t.rank_from && rank <= t.rank_to);
  return tier ? Number(tier.amount) || 0 : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — Team total fantasy points from player_match_stats
// ─────────────────────────────────────────────────────────────────────────────

const calcTeamPoints = async (userTeamId, matchId) => {
  const [rows] = await db.query(
    `SELECT SUM(pms.fantasy_points) AS total_points
     FROM user_team_players utp
     JOIN player_match_stats pms
       ON pms.player_id = utp.player_id
      AND pms.match_id  = ?
     WHERE utp.user_team_id = ?`,
    [matchId, userTeamId]
  );
  return parseFloat(rows[0]?.total_points || 0);
};

// ─────────────────────────────────────────────────────────────────────────────
// GET ALL CONTESTS (admin / debug)
// ─────────────────────────────────────────────────────────────────────────────

export const getAllContestsService = async () => {
  const [rows] = await db.query(
    `SELECT * FROM contest ORDER BY entry_fee ASC`
  );

  return rows.map(c => ({
    id:                    c.id,
    matchId:               c.match_id,
    entryFee:              Number(c.entry_fee)               || 0,
    prizePool:             Number(c.prize_pool)              || 0,
    netPoolPrize:          Number(c.net_pool_prize)          || 0,
    maxEntries:            c.max_entries                     || 0,
    minEntries:            c.min_entries                     || 0,
    currentEntries:        c.current_entries                 || 0,
    contestType:           c.contest_type                    || null,
    isGuaranteed:          c.is_guaranteed === 1,
    winnerPercentage:      Number(c.winner_percentage)       || 0,
    totalWinners:          c.total_winners                   || 0,
    refundStartRank:       c.refund_start_rank               || 0,
    bonusRanks:            c.bonus_ranks                     || 0,
    firstPrize:            Number(c.first_prize)             || 0,
    prizeDistribution:     c.prize_distribution              || null,
    platformFeePercentage: Number(c.platform_fee_percentage) || 0,
    platformFeeAmount:     Number(c.platform_fee_amount)     || 0,
    status:                c.status                          || null,
    createdAt:             c.created_at                      || null,
  }));
};

// ─────────────────────────────────────────────────────────────────────────────
// GET CONTESTS BY MATCH (user-facing, includes join status)
// ─────────────────────────────────────────────────────────────────────────────

export const getContestsService = async (matchId, userId) => {
  if (!matchId) throw new Error("matchId is required");
  if (!userId)  throw new Error("userId is required");

  const [rows] = await db.query(
    `SELECT
       c.*,
       COUNT(ce.id) AS my_team_count
     FROM contest c
     LEFT JOIN contest_entries ce
       ON ce.contest_id = c.id
      AND ce.user_id    = ?
     WHERE c.match_id = ?
     GROUP BY c.id
     ORDER BY c.entry_fee DESC`,
    [userId, matchId]
  );

  if (!rows?.length) return [];

  return rows.map(c => {
    let prizeDistribution = null;
    try {
      prizeDistribution = c.prize_distribution
        ? JSON.parse(c.prize_distribution)
        : null;
    } catch {
      prizeDistribution = null;
    }

    const myTeamCount = Number(c.my_team_count) || 0;

    return {
      id:                    c.id,
      matchId:               c.match_id,
      entryFee:              Number(c.entry_fee)               || 0,
      prizePool:             Number(c.prize_pool)              || 0,
      netPoolPrize:          Number(c.net_pool_prize)          || 0,
      maxEntries:            c.max_entries                     || 0,
      minEntries:            c.min_entries                     || 0,
      currentEntries:        c.current_entries                 || 0,
      remainingSpots:        Math.max((c.max_entries || 0) - (c.current_entries || 0), 0),
      myTeamCount,
      isJoined:              myTeamCount > 0,
      contestType:           c.contest_type                    || null,
      isGuaranteed:          c.is_guaranteed === 1,
      winnerPercentage:      Number(c.winner_percentage)       || 0,
      totalWinners:          c.total_winners                   || 0,
      refundStartRank:       c.refund_start_rank               || 0,
      bonusRanks:            c.bonus_ranks                     || 0,
      firstPrize:            Number(c.first_prize)             || 0,
      prizeDistribution,
      platformFeePercentage: Number(c.platform_fee_percentage) || 0,
      status:                c.status                          || null,
      createdAt:             c.created_at                      || null,
    };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// JOIN CONTEST
//
// Wallet deduction priority:
//   1. Deposit wallet   (real money — first preference)
//   2. Earn wallet      (winnings)
//   3. Bonus wallet     (max 5% of total entry)
// ─────────────────────────────────────────────────────────────────────────────

export const joinContestService = async (userId, amount, meta = {}) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const { contestId, userTeamId } = meta;
    if (!contestId || !userTeamId) throw new Error("contestId and userTeamId are required");

    const teamIds = Array.isArray(userTeamId) ? userTeamId : [userTeamId];

    // ── Duplicate team check ──────────────────────────────────────────────
    for (const teamId of teamIds) {
      const [[already]] = await conn.query(
        `SELECT id FROM contest_entries
         WHERE contest_id = ? AND user_id = ? AND user_team_id = ?`,
        [contestId, userId, teamId]
      );
      if (already) throw new Error(`Team ${teamId} is already joined in this contest`);
    }

    // ── Free contest: subscriber check ────────────────────────────────────
    const [[contestCheck]] = await conn.query(
      `SELECT entry_fee FROM contest WHERE id = ?`,
      [contestId]
    );
    if (!contestCheck) throw new Error("Contest not found");

    const isFree = parseFloat(contestCheck.entry_fee) === 0;

    if (isFree) {
      const [[user]] = await conn.query(
        `SELECT subscribe FROM users WHERE id = ?`,
        [userId]
      );
      if (!user?.subscribe) {
        const [[{ joinedCount }]] = await conn.query(
          `SELECT COUNT(*) AS joinedCount FROM contest_entries
           WHERE contest_id = ? AND user_id = ?`,
          [contestId, userId]
        );
        if (joinedCount + teamIds.length > 1) {
          throw new Error("Free contest allows only 1 team for non-subscribers");
        }
      }
    }

    // ── Contest + match lock ──────────────────────────────────────────────
    const [[contest]] = await conn.query(
      `SELECT
         c.id, c.max_entries, c.current_entries, c.status,
         m.status    AS match_status,
         m.matchdate,
         m.start_time
       FROM contest c
       JOIN matches m ON m.id = c.match_id
       WHERE c.id = ?
       FOR UPDATE`,
      [contestId]
    );
    if (!contest) throw new Error("Contest not found");

    if (contest.match_status !== "UPCOMING")
      throw new Error("Match has already started or is completed");

    const now        = new Date();
    const matchStart = new Date(
      `${contest.matchdate.toISOString().split("T")[0]} ${contest.start_time}`
    );
    if (now >= matchStart) throw new Error("Match has already started");

    if (contest.status !== "UPCOMING") throw new Error("Contest is not available for joining");

    const totalTeamsToJoin = teamIds.length;

    if (contest.current_entries >= contest.max_entries)
      throw new Error("Contest is full");
    if (contest.current_entries + totalTeamsToJoin > contest.max_entries)
      throw new Error("Not enough spots left in this contest");

    // ── Entry amount ──────────────────────────────────────────────────────
    const entryAmount = parseFloat(amount);
    if (isNaN(entryAmount) || entryAmount < 0) throw new Error("Invalid entry amount");

    const totalEntry = entryAmount * totalTeamsToJoin;

    // ── Free contest path ─────────────────────────────────────────────────
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
        `UPDATE contest SET current_entries = current_entries + ? WHERE id = ?`,
        [totalTeamsToJoin, contestId]
      );
      await conn.commit();
      return { success: true, message: "Joined free contest successfully" };
    }

    // ── Wallet lock ───────────────────────────────────────────────────────
    const [[wallet]] = await conn.query(
      `SELECT depositwallet, earnwallet, bonusamount, is_frozen
       FROM wallets
       WHERE user_id = ?
       FOR UPDATE`,
      [userId]
    );
    if (!wallet)           throw new Error("Wallet not found");
    if (wallet.is_frozen === 1) throw new Error("Wallet is frozen");

    // ── Deduction priority: deposit → earn → bonus (max 5%) ──────────────
    let remaining = totalEntry;

    const depositUse = Math.min(Number(wallet.depositwallet || 0), remaining);
    remaining = Number((remaining - depositUse).toFixed(2));

    const earnUse = Math.min(Number(wallet.earnwallet || 0), remaining);
    remaining = Number((remaining - earnUse).toFixed(2));

    const maxBonus = Number((totalEntry * BONUS_MAX_PCT).toFixed(2));
    const bonusUse = Math.min(Number(wallet.bonusamount || 0), maxBonus, remaining);
    remaining = Number((remaining - bonusUse).toFixed(2));

    if (remaining > 0) throw new Error("Insufficient wallet balance");

    // ── Update wallet ─────────────────────────────────────────────────────
    await conn.query(
      `UPDATE wallets
       SET depositwallet = depositwallet - ?,
           earnwallet    = earnwallet    - ?,
           bonusamount   = bonusamount   - ?
       WHERE user_id = ?`,
      [depositUse, earnUse, bonusUse, userId]
    );

    // ── Wallet transaction ledger ─────────────────────────────────────────
    const insertTxn = async (walletType, amountUsed) => {
      if (amountUsed <= 0) return;
      await conn.query(
        `INSERT INTO wallet_transactions
           (user_id, wallettype, transtype, amount, remark, reference_id)
         VALUES (?, ?, 'debit', ?, 'Contest join', ?)`,
        [userId, walletType, amountUsed, contestId]
      );
    };

    await insertTxn("deposit", depositUse);
    await insertTxn("winning", earnUse);
    await insertTxn("bonus",   bonusUse);

    // ── Insert contest entries ────────────────────────────────────────────
    for (const teamId of teamIds) {
      await conn.query(
        `INSERT INTO contest_entries
           (contest_id, user_id, user_team_id, entry_fee, status)
         VALUES (?, ?, ?, ?, 'joined')`,
        [contestId, userId, teamId, entryAmount]
      );
    }

    // ── Update contest entry count ────────────────────────────────────────
    const newCount = contest.current_entries + totalTeamsToJoin;
    await conn.query(
      `UPDATE contest SET current_entries = ? WHERE id = ?`,
      [newCount, contestId]
    );

    // ── Auto-mark FULL ────────────────────────────────────────────────────
    if (newCount >= contest.max_entries) {
      await conn.query(
        `UPDATE contest SET status = 'FULL' WHERE id = ?`,
        [contestId]
      );
    }

    await conn.commit();

    return {
      success: true,
      message: "Contest joined successfully",
      deduction: {
        totalEntry,
        depositUsed: depositUse,
        earnUsed:    earnUse,
        bonusUsed:   bonusUse,
      },
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET MY CONTESTS (for a specific match, with team details)
// ─────────────────────────────────────────────────────────────────────────────

export const getMyContestsService = async (userId, matchId) => {
  if (!userId)  throw new Error("userId is required");
  if (!matchId) throw new Error("matchId is required");

  // Step 1 — Match status (controls visibility of other teams)



const [[match]] = await db.query(
  `SELECT 
     m.status,
     m.matchdate,
     ht.name       AS home_team_name,
     ht.short_name AS home_team_short_name,
     at.name       AS away_team_name,
     at.short_name AS away_team_short_name
   FROM matches m
   JOIN teams ht ON ht.id = m.home_team_id
   JOIN teams at ON at.id = m.away_team_id
   WHERE m.id = ?`,
  [matchId]
);




  if (!match) throw new Error("Match not found");

  const matchStatus  = match.status?.toUpperCase();
  const showAllTeams = matchStatus === "LIVE" || matchStatus === "RESULT";

  // Step 2 — Contests this user is in
  const [contestRows] = await db.query(
    `SELECT
       c.id                  AS contest_id,
       c.match_id,
       c.entry_fee,
       c.prize_pool,
       c.net_pool_prize,
       c.max_entries,
       c.current_entries,
       c.contest_type,
       c.status,
       c.first_prize,
       c.total_winners,
       c.winner_percentage,
       c.refund_start_rank,
       c.bonus_ranks,
       c.platform_fee_percentage,
       COUNT(ce.id) AS my_team_count
     FROM contest_entries ce
     JOIN contest c ON ce.contest_id = c.id
     WHERE ce.user_id = ? AND c.match_id = ?
     GROUP BY c.id
     ORDER BY MAX(ce.id) DESC`,
    [userId, matchId]
  );

  if (!contestRows?.length) return [];

  const contestIds = contestRows.map(c => c.contest_id);

  // Step 3 — My entries
  const [myEntryRows] = await db.query(
    `SELECT
       ce.id         AS entry_id,
       ce.contest_id,
       ce.user_team_id,
       ce.user_id,
       ce.entry_fee,
       ce.urank,
       ce.winning_amount,
       ce.status     AS entry_status,
       ce.joined_at
     FROM contest_entries ce
     WHERE ce.user_id = ? AND ce.contest_id IN (?)`,
    [userId, contestIds]
  );

  // Step 4 — Other entries (LIVE / RESULT only)
  let allEntryRows = [];
  if (showAllTeams) {
    const [rows] = await db.query(
      `SELECT
         ce.id         AS entry_id,
         ce.contest_id,
         ce.user_team_id,
         ce.user_id,
         ce.entry_fee,
         ce.urank,
         ce.winning_amount,
         ce.status     AS entry_status,
         ce.joined_at,
         u.name        AS user_name,
         u.nickname    AS user_nickname
       FROM contest_entries ce
       JOIN users u ON u.id = ce.user_id
       WHERE ce.contest_id IN (?) AND ce.user_id != ?`,
      [contestIds, userId]
    );
    allEntryRows = rows;
  }

  // Step 5 — Fetch all relevant teams in one query
  const myTeamIds    = [...new Set(myEntryRows.map(e => e.user_team_id).filter(Boolean))];
  const otherTeamIds = showAllTeams
    ? [...new Set(allEntryRows.map(e => e.user_team_id).filter(Boolean))]
    : [];
  const allTeamIds   = [...new Set([...myTeamIds, ...otherTeamIds])];

  let teamsMap = {};

  if (allTeamIds.length > 0) {
    const [teamRows] = await db.query(
      `SELECT
         ut.id               AS team_id,
         ut.user_id          AS team_owner_id,
         ut.team_name,
         ut.team_rank,
         ut.locked,
         ut.created_at,
         utp.id              AS player_entry_id,
         utp.player_id,
         utp.is_captain,
         utp.is_vice_captain,
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
       LEFT JOIN players p             ON p.id = utp.player_id
       LEFT JOIN teams   t             ON t.id = p.team_id
       WHERE ut.id IN (?)`,
      [allTeamIds]
    );

    teamRows.forEach(row => {
      if (!teamsMap[row.team_id]) {
        teamsMap[row.team_id] = {
          teamId:       row.team_id,
          teamOwnerId:  row.team_owner_id,
          teamName:     row.team_name  || null,
          teamRank:     row.team_rank  || null,
          locked:       row.locked === 1,
          createdAt:    row.created_at || null,
          totalPoints:  0,
          totalCredits: 0,
          creditsLeft:  100,
          players:      [],
        };
      }

      if (row.player_entry_id) {
        const credits = parseFloat(row.playercredits) || 0;
        const points  = parseFloat(row.player_points)  || 0;

        teamsMap[row.team_id].players.push({
          playerEntryId:     row.player_entry_id,
          playerId:          row.player_id,
          playerName:        row.player_name          || null,
          playerImage:       row.player_image         || null,
          position:          row.position             || null,
          credits,
          flagImage:         row.flag_image           || null,
          country:           row.country              || null,
          realTeamShortName: row.real_team_short_name || null,
          role:              row.role                 || null,
          isCaptain:         row.is_captain      === 1,
          isViceCaptain:     row.is_vice_captain === 1,
          isSubstitute:      row.is_substitude   === 1,
          points,
        });

        teamsMap[row.team_id].totalPoints  += points;
        teamsMap[row.team_id].totalCredits += credits;
      }
    });

    Object.values(teamsMap).forEach(team => {
      team.totalPoints  = parseFloat(team.totalPoints.toFixed(2));
      team.totalCredits = parseFloat(team.totalCredits.toFixed(2));
      team.creditsLeft  = parseFloat((100 - team.totalCredits).toFixed(2));
    });
  }

  // Step 6 — Group entries by contest
  const myEntriesByContest    = {};
  const otherEntriesByContest = {};

  myEntryRows.forEach(e => {
    if (!myEntriesByContest[e.contest_id]) myEntriesByContest[e.contest_id] = [];
    myEntriesByContest[e.contest_id].push(e);
  });

  if (showAllTeams) {
    allEntryRows.forEach(e => {
      if (!otherEntriesByContest[e.contest_id]) otherEntriesByContest[e.contest_id] = [];
      otherEntriesByContest[e.contest_id].push(e);
    });
  }

  // Step 7 — Build response
  const formatEntry = (e, isOwn, contest) => {
    const team    = teamsMap[e.user_team_id] || null;
    let   players = team?.players || [];

    // Hide captain/vice-captain for other teams when match is UPCOMING
    if (!isOwn && !showAllTeams) {
      players = players.map(p => ({ ...p, isCaptain: false, isViceCaptain: false }));
    }

    const prize = getPrizeForRank(
      e.urank,
      contest.prize_distribution ?? null,
      contest.entry_fee,
      contest.total_winners,
      contest.refund_start_rank
    );

    return {
      entryId:       e.entry_id,
      userId:        e.user_id,
      userName:      e.user_name     || null,
      userNickname:  e.user_nickname || null,
      isMyEntry:     isOwn,
      entryFee:      Number(e.entry_fee)      || 0,
      urank:         e.urank                  || null,
      winningAmount: Number(e.winning_amount) || prize,
      entryStatus:   e.entry_status           || null,
      joinedAt:      e.joined_at              || null,
      teamId:        team?.teamId             || null,
      teamName:      team?.teamName           || null,
      teamRank:      team?.teamRank           || null,
      locked:        team?.locked             ?? null,
      totalPoints:   team?.totalPoints        || 0,
      totalCredits:  team?.totalCredits       || 0,
      creditsLeft:   team?.creditsLeft        ?? 100,
      players,
    };
  };

  return contestRows.map(c => {
    const myEntries    = (myEntriesByContest[c.contest_id]    || []).map(e => formatEntry(e, true,  c));
    const otherEntries = (otherEntriesByContest[c.contest_id] || []).map(e => formatEntry(e, false, c));

    return {
      contest_id:              c.contest_id,
      match_id:                c.match_id,
      match_status:            matchStatus,
      match_date:              match.matchdate              || null,
      home_team_name:          match.home_team_name          || null,
      home_team_short_name:    match.home_team_short_name    || null,
      away_team_name:          match.away_team_name          || null,
      away_team_short_name:    match.away_team_short_name    || null,
      entry_fee:               Number(c.entry_fee)               || 0,
      prize_pool:              Number(c.prize_pool)              || 0,
      net_pool_prize:          Number(c.net_pool_prize)          || 0,
      max_entries:             c.max_entries                     || 0,
      current_entries:         c.current_entries                 || 0,
      remaining_spots:         Math.max((c.max_entries || 0) - (c.current_entries || 0), 0),
      contest_type:            c.contest_type                    || null,
      status:                  c.status                         || null,
      first_prize:             Number(c.first_prize)             || 0,
      total_winners:           c.total_winners                   || 0,
      refund_start_rank:       c.refund_start_rank               || 0,
      bonus_ranks:             c.bonus_ranks                     || 0,
      winner_percentage:       Number(c.winner_percentage)       || 0,
      platform_fee_percentage: Number(c.platform_fee_percentage) || 0,
      my_team_count:           Number(c.my_team_count)           || 0,
      my_teams:                myEntries,
      other_teams:             showAllTeams ? otherEntries : [],
    };
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────

export const getLeaderboardService = async (contestId, userId, page = 1, limit = 50) => {
  const offset = (page - 1) * limit;

  // Step 1 — Contest + match info
  const [[contest]] = await db.query(
    `SELECT
       c.id, c.match_id, c.prize_pool, c.net_pool_prize,
       c.first_prize, c.prize_distribution,
       c.current_entries, c.entry_fee, c.status,
       c.contest_type, c.total_winners,
       c.winner_percentage, c.refund_start_rank, c.bonus_ranks,
       m.status       AS match_status,
       m.seriesname,
       m.hometeamname,
       m.awayteamname,
       m.matchdate,
       m.start_time
     FROM contest c
     JOIN matches m ON m.id = c.match_id
     WHERE c.id = ?`,
    [contestId]
  );
  if (!contest) return { success: false, message: "Contest not found" };

  // Step 2 — Paginated leaderboard entries
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
       u.image,
       ut.team_name
     FROM contest_entries ce
     JOIN users      u  ON u.id  = ce.user_id
     LEFT JOIN user_teams ut ON ut.id = ce.user_team_id
     WHERE ce.contest_id = ?
     ORDER BY ce.urank ASC
     LIMIT ? OFFSET ?`,
    [contestId, limit, offset]
  );

  // Step 3 — Total count
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM contest_entries WHERE contest_id = ?`,
    [contestId]
  );

  // Step 4 — Batch team points (fixes N+1)
  const teamIds   = entries.map(e => e.user_team_id).filter(Boolean);
  let pointsMap   = {};

  if (teamIds.length > 0) {
    const [pointsRows] = await db.query(
      `SELECT
         utp.user_team_id,
         SUM(pms.fantasy_points) AS total_points
       FROM user_team_players utp
       JOIN player_match_stats pms
         ON pms.player_id = utp.player_id
        AND pms.match_id  = ?
       WHERE utp.user_team_id IN (?)
       GROUP BY utp.user_team_id`,
      [contest.match_id, teamIds]
    );
    pointsRows.forEach(r => {
      pointsMap[r.user_team_id] = parseFloat(r.total_points || 0);
    });
  }

  // Step 5 — Build leaderboard rows
  const leaderboard = entries.map(entry => {
    const points = pointsMap[entry.user_team_id] || 0;
    const prize  = entry.winning_amount
      || getPrizeForRank(
           entry.urank,
           contest.prize_distribution,
           contest.entry_fee,
           contest.total_winners,
           contest.refund_start_rank
         );

    return {
      rank:           entry.urank,
      user_id:        entry.user_id,
      username:       entry.nickname || entry.name || `User${entry.user_id}`,
      profile_image:  entry.image    || null,
      team_name:      entry.team_name || null,
      user_team_id:   entry.user_team_id,
      points,
      winning_amount: prize,
      is_winner:      prize > 0,
      is_me:          userId ? entry.user_id === parseInt(userId) : false,
    };
  });

  // Step 6 — My best entry (pinned card at top of leaderboard)
  let my_entry = null;

  if (userId) {
    const [myEntries] = await db.query(
      `SELECT
         ce.user_team_id,
         ce.urank,
         ce.winning_amount,
         ut.team_name,
         u.name,
         u.nickname,
         u.image
       FROM contest_entries ce
       LEFT JOIN user_teams ut ON ut.id  = ce.user_team_id
       LEFT JOIN users      u  ON u.id   = ce.user_id
       WHERE ce.contest_id = ? AND ce.user_id = ?`,
      [contestId, userId]
    );

    if (myEntries.length > 0) {
      // Pick team with highest fantasy points
      const best = myEntries.reduce((prev, curr) => {
        const prevPts = pointsMap[prev.user_team_id] || 0;
        const currPts = pointsMap[curr.user_team_id] || 0;
        return currPts > prevPts ? curr : prev;
      });

      const myPoints = pointsMap[best.user_team_id] !== undefined
        ? pointsMap[best.user_team_id]
        : await calcTeamPoints(best.user_team_id, contest.match_id);

      const myPrize = best.winning_amount
        || getPrizeForRank(
             best.urank,
             contest.prize_distribution,
             contest.entry_fee,
             contest.total_winners,
             contest.refund_start_rank
           );

      my_entry = {
        user_team_id:   best.user_team_id,
        team_name:      best.team_name   || null,
        username:       best.nickname    || best.name || `User${userId}`,
        profile_image:  best.image       || null,
        rank:           best.urank,
        points:         myPoints,
        winning_amount: myPrize,
        is_winner:      myPrize > 0,
      };
    }
  }

  // Step 7 — Prize tiers for Winnings tab
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
      id:               contest.id,
      prize_pool:       Number(contest.prize_pool)      || 0,
      net_pool_prize:   Number(contest.net_pool_prize)  || 0,
      first_prize:      Number(contest.first_prize)     || 0,
      entry_fee:        Number(contest.entry_fee)       || 0,
      total_entries:    contest.current_entries         || 0,
      total_winners:    contest.total_winners           || 0,
      refund_start_rank:contest.refund_start_rank       || 0,
      bonus_ranks:      contest.bonus_ranks             || 0,
      winner_percentage:Number(contest.winner_percentage)|| 0,
      contest_type:     contest.contest_type            || null,
      status:           contest.status                  || null,
      match_status:     contest.match_status            || null,
      series_name:      contest.seriesname              || null,
      home_team:        contest.hometeamname            || null,
      away_team:        contest.awayteamname            || null,
      match_date:       contest.matchdate               || null,
      start_time:       contest.start_time              || null,
      prize_tiers:      prizeTiers,
    },
    my_entry,
    leaderboard,
    pagination: {
      current_page:  page,
      per_page:      limit,
      total_entries: parseInt(total),
      total_pages:   Math.ceil(total / limit),
      has_more:      offset + limit < parseInt(total),
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// MY RANK (specific user + specific team in a contest)
// ─────────────────────────────────────────────────────────────────────────────

export const getMyRankService = async (contestId, userId, userTeamId) => {
  const [[contest]] = await db.query(
    `SELECT
       id, match_id, prize_pool, first_prize,
       prize_distribution, current_entries, entry_fee,
       status, total_winners, refund_start_rank
     FROM contest
     WHERE id = ?`,
    [contestId]
  );
  if (!contest) return { success: false, message: "Contest not found" };

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
  if (!entry) return { success: false, message: "Team not found in this contest" };

  const points = await calcTeamPoints(entry.user_team_id, contest.match_id);
  const prize  = entry.winning_amount
    || getPrizeForRank(
         entry.urank,
         contest.prize_distribution,
         contest.entry_fee,
         contest.total_winners,
         contest.refund_start_rank
       );

  return {
    success:        true,
    user_id:        parseInt(userId),
    username:       entry.nickname || entry.name || `User${userId}`,
    profile_image:  entry.image    || null,
    user_team_id:   entry.user_team_id,
    rank:           entry.urank,
    points,
    winning_amount: prize,
    is_winner:      prize > 0,
    total_entries:  contest.current_entries,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SCORE BREAKDOWN (player-level fantasy points for a team)
// ─────────────────────────────────────────────────────────────────────────────

export const getScoreBreakdownService = async (contestId, userTeamId, matchId) => {
  if (!contestId || !userTeamId || !matchId)
    throw new Error("contestId, userTeamId, and matchId are required");

  const [teamPlayers] = await db.query(
    `SELECT
       utp.player_id       AS playerId,
       utp.is_captain      AS isCaptain,
       utp.is_vice_captain AS isViceCaptain,
       p.name,
       p.position,
       p.playerimage       AS image
     FROM user_team_players utp
     JOIN players p ON p.id = utp.player_id
     WHERE utp.user_team_id = ?`,
    [userTeamId]
  );
  if (!teamPlayers.length) throw new Error("Team not found");

  const playerIds  = teamPlayers.map(p => p.playerId);
  const allStats   = await fetchPlayerStats(matchId, playerIds);
  const statsMap   = {};
  allStats.forEach(s => { statsMap[s.playerId] = s; });

  const captainId     = teamPlayers.find(p => p.isCaptain)?.playerId     || null;
  const viceCaptainId = teamPlayers.find(p => p.isViceCaptain)?.playerId || null;

  const playerStatsList = teamPlayers.map(p => statsMap[p.playerId]).filter(Boolean);
  const result          = calculateTeamPoints(playerStatsList, captainId, viceCaptainId);

  const playersWithInfo = result.players.map(scored => {
    const info = teamPlayers.find(p => p.playerId === scored.playerId) || {};
    return {
      playerId:      scored.playerId,
      name:          info.name          || null,
      image:         info.image         || null,
      position:      info.position      || null,
      isCaptain:     info.isCaptain     === 1,
      isViceCaptain: info.isViceCaptain === 1,
      basePoints:    scored.basePoints,
      finalPoints:   scored.finalPoints,
      breakdown:     scored.breakdown,
    };
  });

  return {
    success:    true,
    userTeamId,
    teamTotal:  result.teamTotal,
    players:    playersWithInfo,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTEST WINNINGS — prize pool breakdown for the "Winnings" tab
// ─────────────────────────────────────────────────────────────────────────────

export const getContestWinningsService = async (contestId) => {
  const [[contest]] = await db.query(
    `SELECT
       c.id, c.prize_pool, c.net_pool_prize, c.first_prize,
       c.prize_distribution, c.current_entries,
       c.max_entries, c.entry_fee, c.status,
       c.contest_type, c.total_winners,
       c.winner_percentage, c.refund_start_rank, c.bonus_ranks,
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
      refund_start_rank: contest.refund_start_rank         || 0,
      bonus_ranks:       contest.bonus_ranks               || 0,
      winner_percentage: Number(contest.winner_percentage) || 0,
      contest_type:      contest.contest_type              || null,
      status:            contest.status                    || null,
      is_guaranteed:     contest.is_guaranteed === 1,
      min_entries:       contest.min_entries               || 0,
    },
    // Bonus-zone tiers only — frontend adds refund + no-prize zones itself
    prize_tiers: prizeTiers,
    // Convenience fields so frontend can render all 3 zones without extra logic
    refund_zone: {
      rank_from:   (contest.refund_start_rank || 0),
      rank_to:     contest.total_winners      || 0,
      prize:       Number(contest.entry_fee)  || 0,
      label:       "Entry fee return",
    },
    no_prize_zone: {
      rank_from: (contest.total_winners || 0) + 1,
      rank_to:   contest.max_entries          || 0,
      prize:     0,
      label:     "No prize",
    },
  };
};