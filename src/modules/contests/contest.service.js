
import db from "../../config/db.js";
import redis from "../../config/redis.js";
import { calculateTeamPoints } from "../scoring/scoring.engine.js";
import { fetchPlayerStats } from "../scoring/scoring.service.js";
import { applyReferralContestBonus } from "../auth/auth.service.js";
import { getMyTeamsWithPlayersService } from "../teams/team.service.js";
import { leaderboardCacheKey as lbKey } from '../sportmonks/sportmonks.cron.js';
import { logActivity } from "../../utils/activity.logger.js";


export const getAllContestsService = async () => {
  const [rows] = await db.query(`SELECT * FROM contest ORDER BY entry_fee ASC`);

  return rows.map(c => ({
    id: c.id,
    matchId: c.match_id,
    entryFee: Number(c.entry_fee) || 0,
    prizePool: Number(c.prize_pool) || 0,
    netPoolPrize: Number(c.net_pool_prize) || 0,
    maxEntries: c.max_entries || 0,
    minEntries: c.min_entries || 0,
    currentEntries: c.current_entries || 0,
    contestType: c.contest_type || null,
    isGuaranteed: c.is_guaranteed === 1,
    winnerPercentage: Number(c.winner_percentage) || 0,
    totalWinners: c.total_winners || 0,
    refundStartRank: c.refund_start_rank || 0,
    bonusRanks: c.bonus_ranks || 0,
    rank1Percent: Number(c.rank1_percent) || 0,
    top1EndRank: c.top1_end_rank || 0,
    linearStartRank: c.linear_start_rank || 0,
    linearEndRank: c.linear_end_rank || 0,
    firstPrize: Number(c.first_prize) || 0,
    prizeDistribution: c.prize_distribution || null,
    platformFeePercentage: Number(c.platform_fee_percentage) || 0,
    platformFeeAmount: Number(c.platform_fee_amount) || 0,
    status: c.status || null,
    createdAt: c.created_at || null,
  }));
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTEST HISTORY SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export const getContestHistoryService = async (userId, { year, month, page, limit }) => {
  const offset = (page - 1) * limit;

  const conditions = [`ce.user_id = ?`];
  const params = [userId];

  if (year) {
    conditions.push(`YEAR(m.matchdate) = ?`);
    params.push(year);
  }
  if (month) {
    conditions.push(`MONTH(m.matchdate) = ?`);
    params.push(month);
  }

  const WHERE = conditions.join(" AND ");

  // ── Summary ──
  const [[summary]] = await db.query(
    `SELECT
       COUNT(DISTINCT c.id)                        AS total_contests,
       SUM(ce.entry_fee)                           AS total_spent,
       SUM(ce.winning_amount)                      AS total_earnings,
       SUM(ce.winning_amount) - SUM(ce.entry_fee)  AS net_profit,
       COUNT(CASE WHEN ce.winning_amount > 0 THEN 1 END) AS total_won
     FROM contest_entries ce
     JOIN contest c ON c.id = ce.contest_id
     JOIN matches m ON m.id = c.match_id
     WHERE ${WHERE}`,
    params
  );

  // ── Contest rows ──
  const [contestRows] = await db.query(
    `SELECT
       c.id              AS contest_id,
       c.contest_type,
       c.entry_fee,
       c.prize_pool,
       c.first_prize,
       c.status,
       c.current_entries AS total_entries,
       m.id              AS match_id,
       m.matchdate       AS match_date,
       m.status          AS match_status,
       ht.name           AS home_team,
       ht.short_name     AS home_team_short,
       at.name           AS away_team,
       at.short_name     AS away_team_short
     FROM contest_entries ce
     JOIN contest c  ON c.id  = ce.contest_id
     JOIN matches m  ON m.id  = c.match_id
     JOIN teams ht   ON ht.id = m.home_team_id
     JOIN teams at   ON at.id = m.away_team_id
     WHERE ${WHERE}
     GROUP BY
       c.id, c.contest_type, c.entry_fee, c.prize_pool,
       c.first_prize, c.status, c.current_entries,
       m.id, m.matchdate, m.status,
       ht.name, ht.short_name,
       at.name, at.short_name
     ORDER BY m.matchdate DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // ── Total count ──
  const [[{ total }]] = await db.query(
    `SELECT COUNT(DISTINCT c.id) AS total
     FROM contest_entries ce
     JOIN contest c ON c.id = ce.contest_id
     JOIN matches m ON m.id = c.match_id
     WHERE ${WHERE}`,
    params
  );

  if (!contestRows.length) {
    return {
      success: true,
      filters: { year, month },
      summary: {
        total_contests: 0,
        total_won: 0,
        total_spent: 0,
        total_earnings: 0,
        net_profit: 0,
      },
      data: [],
      pagination: { current_page: page, per_page: limit, total: 0, has_more: false },
    };
  }

  // ── My entries per contest ──
  const contestIds = contestRows.map(c => c.contest_id);
  const [entryRows] = await db.query(
    `SELECT
       ce.contest_id,
       ce.user_team_id,
       ce.urank          AS my_rank,
       ce.winning_amount,
       ce.entry_fee,
       ut.team_name,
       SUM(
         CASE
           WHEN utp.is_captain      = 1 THEN pms.fantasy_points * 2
           WHEN utp.is_vice_captain = 1 THEN pms.fantasy_points * 1.5
           ELSE pms.fantasy_points
         END
       ) AS my_points
     FROM contest_entries ce
     LEFT JOIN user_teams ut         ON ut.id = ce.user_team_id
     LEFT JOIN user_team_players utp ON utp.user_team_id = ce.user_team_id
     LEFT JOIN contest con           ON con.id = ce.contest_id
     LEFT JOIN player_match_stats pms
            ON pms.player_id = utp.player_id
           AND pms.match_id  = con.match_id
     WHERE ce.user_id = ? AND ce.contest_id IN (?)
     GROUP BY
       ce.id, ce.contest_id, ce.user_team_id, ce.urank,
       ce.winning_amount, ce.entry_fee, ut.team_name`,
    [userId, contestIds]
  );

  // ── Group entries by contest ──
  const entriesByContest = {};
  entryRows.forEach(e => {
    if (!entriesByContest[e.contest_id]) entriesByContest[e.contest_id] = [];
    entriesByContest[e.contest_id].push({
      team_name: e.team_name || null,
      my_rank: e.my_rank || null,
      my_points: parseFloat(e.my_points) || 0,
      winning_amount: Number(e.winning_amount) || 0,
    });
  });

  // ── Build response ──
  const data = contestRows.map(c => {
    const myTeams = entriesByContest[c.contest_id] || [];
    const totalSpent = myTeams.length * Number(c.entry_fee);
    const totalWon = myTeams.reduce((s, t) => s + t.winning_amount, 0);

    return {
      contest_id: c.contest_id,
      match: {
        id: c.match_id,
        home_team: c.home_team,
        home_team_short: c.home_team_short,
        away_team: c.away_team,
        away_team_short: c.away_team_short,
        match_date: c.match_date || null,
        status: c.match_status || null,
      },
      contest_type: c.contest_type || null,
      entry_fee: Number(c.entry_fee) || 0,
      prize_pool: Number(c.prize_pool) || 0,
      first_prize: Number(c.first_prize) || 0,
      total_entries: c.total_entries || 0,
      my_teams: myTeams,
      total_spent: totalSpent,
      total_won: totalWon,
      net: parseFloat((totalWon - totalSpent).toFixed(2)),
      status: c.status || null,
    };
  });

  return {
    success: true,
    filters: { year, month },
    summary: {
      total_contests: parseInt(summary.total_contests) || 0,
      total_won: parseInt(summary.total_won) || 0,
      total_spent: parseFloat(summary.total_spent) || 0,
      total_earnings: parseFloat(summary.total_earnings) || 0,
      net_profit: parseFloat(summary.net_profit) || 0,
    },
    data,
    pagination: {
      current_page: page,
      per_page: limit,
      total: parseInt(total),
      has_more: offset + limit < parseInt(total),
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const BONUS_MAX_PCT = 0.05; // max 5% of entry fee from bonus wallet

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — Prize for a given rank
// Zone 1 — Bonus  : rank 1 → (refundStartRank - 1)  → prize_distribution tier
// Zone 2 — Refund : rank refundStartRank → refundWinners → entry_fee
// Zone 3 — No prize: rank > refundWinners → 0
// ─────────────────────────────────────────────────────────────────────────────

export const getPrizeForRank = (rank, prizeDistribution, entryFee, refundWinners, refundStartRank) => {
  if (!rank || rank <= 0) return 0;
  if (rank > refundWinners) return 0;                     // Zone 3
  if (rank >= refundStartRank) return Number(entryFee) || 0; // Zone 2

  if (!prizeDistribution) return 0;

  let tiers;
  try {
    tiers = typeof prizeDistribution === "string"
      ? JSON.parse(prizeDistribution)
      : prizeDistribution;
  } catch {
    return 0;
  }

  const tier = tiers.find(t => {
    if (t.rank !== undefined) return t.rank === rank;
    return rank >= t.rank_from && rank <= t.rank_to;
  });

  return tier ? Number(tier.amount) || 0 : 0;
};

const buildCompetitionRankMap = (scoredRows = []) => {
  const sorted = [...scoredRows].sort((a, b) => b.points - a.points);
  const rankMap = {};

  let prevPoints = null;
  let currentRank = 0;

  sorted.forEach((row, idx) => {
    if (prevPoints === null || row.points !== prevPoints) {
      currentRank = idx + 1;
      prevPoints = row.points;
    }
    rankMap[row.userTeamId] = currentRank;
  });

  return rankMap;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — Team total points WITH captain ×2 / vice-captain ×1.5
// ─────────────────────────────────────────────────────────────────────────────

const calcTeamPoints = async (userTeamId, matchId) => {
  const [rows] = await db.query(
    `SELECT
       SUM(
         CASE
           WHEN utp.is_captain      = 1 THEN pms.fantasy_points * 2
           WHEN utp.is_vice_captain = 1 THEN pms.fantasy_points * 1.5
           ELSE pms.fantasy_points
         END
       ) AS total_points
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
// GET ALL CONTESTS  (admin / debug)
// ─────────────────────────────────────────────────────────────────────────────

  
// ─────────────────────────────────────────────────────────────────────────────
// GET CONTESTS BY MATCH  (user-facing, includes join status)
// ─────────────────────────────────────────────────────────────────────────────

export const getContestsService = async (matchId, userId) => {
  if (!matchId) throw new Error("matchId is required");
  if (!userId) throw new Error("userId is required");

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
      prizeDistribution = c.prize_distribution ? JSON.parse(c.prize_distribution) : null;
    } catch { prizeDistribution = null; }

    const myTeamCount = Number(c.my_team_count) || 0;

    return {
      id: c.id,
      matchId: c.match_id,
      entryFee: Number(c.entry_fee) || 0,
      prizePool: Number(c.prize_pool) || 0,
      netPoolPrize: Number(c.net_pool_prize) || 0,
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
      refundStartRank: c.refund_start_rank || 0,
      bonusRanks: c.bonus_ranks || 0,
      rank1Percent: Number(c.rank1_percent) || 0,
      top1EndRank: c.top1_end_rank || 0,
      linearStartRank: c.linear_start_rank || 0,
      linearEndRank: c.linear_end_rank || 0,
      firstPrize: Number(c.first_prize) || 0,
      prizeDistribution,
      platformFeePercentage: Number(c.platform_fee_percentage) || 0,
      status: c.status || null,
      createdAt: c.created_at || null,
    };
  });
};

export const getFantasyDashboardService = async (userId, matchId) => {
  if (!userId) throw new Error("userId is required");
  if (!matchId) throw new Error("matchId is required");

  const [contests, myContests, myTeams] = await Promise.all([
    getContestsService(matchId, userId),
    getMyContestsService(userId, matchId),
    getMyTeamsWithPlayersService(userId, matchId),
  ]);

  return {
    success: true,
    match_id: Number(matchId),
    data: {
      contests,
      my_contests: myContests,
      my_teams: myTeams,
    },
    meta: {
      contests_count: contests.length,
      my_contests_count: myContests.length,
      my_teams_count: myTeams.length,
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// JOIN CONTEST
// Fixes applied:
//   1. Correct signature — (userId, entryFee, { contestId, userTeamId, ip, device })
//   2. Inserts into contest_entries (not contest_participants)
//   3. Uses max_entries / current_entries (not max_teams / total_joined)
//   4. Supports multi-team join (userTeamId can be array)
//   5. Duplicate check per team in contest_entries
//   6. Increments current_entries
//   7. Calls applyReferralContestBonus with same conn (inside transaction)
// ─────────────────────────────────────────────────────────────────────────────


export const joinContestService = async (userId, { contestId, userTeamId, ip, device }) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // ── 1. Contest exists & open? ──
    const [[contest]] = await conn.query(
      `SELECT id, entry_fee, max_entries, current_entries, status
       FROM contest WHERE id = ? FOR UPDATE`,
      [contestId]
    );
    if (!contest)
      throw Object.assign(new Error("Contest not found"), { statusCode: 404 });
    if (contest.status !== "UPCOMING")
      throw Object.assign(new Error("Contest is not open for joining"), { statusCode: 400 });
    if (contest.current_entries >= contest.max_entries)
      throw Object.assign(new Error("Contest is full"), { statusCode: 400 });

    const contestEntryFee = Number(contest.entry_fee);

    // ── 2. Normalise userTeamId — support single or array ──
    const teamIds = Array.isArray(userTeamId)
      ? userTeamId.map(Number)
      : [Number(userTeamId)];

    if (!teamIds.length)
      throw Object.assign(new Error("userTeamId is required"), { statusCode: 400 });

    // ── 3. matchId fetch ──
    const matchId = (await conn.query(
      `SELECT match_id FROM contest WHERE id = ?`, [contestId]
    ))[0][0]?.match_id;

    // ── 3.1. Per match 20 teams limit check ──
    // const [[{ existingTeamCount }]] = await conn.query(
    //   `SELECT COUNT(DISTINCT ce.user_team_id) AS existingTeamCount
    //    FROM contest_entries ce
    //    JOIN contest c ON c.id = ce.contest_id
    //    WHERE ce.user_id = ?
    //      AND c.match_id = ?`,
    //   [userId, matchId]
    // );


    // ── 3.1. Per contest 20 teams limit check ──
    const [[{ existingTeamCount }]] = await conn.query(
      `SELECT COUNT(DISTINCT user_team_id) AS existingTeamCount
   FROM contest_entries
   WHERE user_id = ? AND contest_id = ?`,
      [userId, contestId]
    );

    const remaining = 20 - Number(existingTeamCount);
    if (remaining <= 0)
      throw Object.assign(
        new Error("Maximum 20 teams per contest limit reached"),
        { statusCode: 400 }
      );
    if (teamIds.length > remaining)
      throw Object.assign(
        new Error(`Only ${remaining} more team(s) allowed for this contest. Maximum 20 teams per contest`),
        { statusCode: 400 }
      );


    // ── 3.2. Validate all teams belong to this user & correct match ──
    const [teamRows] = await conn.query(
      `SELECT id FROM user_teams
       WHERE id IN (?) AND user_id = ? AND match_id = ?`,
      [teamIds, userId, matchId]
    );
    if (teamRows.length !== teamIds.length)
      throw Object.assign(new Error("One or more teams are invalid"), { statusCode: 400 });

    // ── 4. Duplicate entry check per team ──
    const [existingEntries] = await conn.query(
      `SELECT user_team_id FROM contest_entries
       WHERE contest_id = ? AND user_id = ? AND user_team_id IN (?)`,
      [contestId, userId, teamIds]
    );
    if (existingEntries.length > 0)
      throw Object.assign(new Error("One or more teams already joined this contest"), { statusCode: 400 });

    // ── 5. Enough spots? ──
    const spotsLeft = contest.max_entries - contest.current_entries;
    if (teamIds.length > spotsLeft)
      throw Object.assign(new Error("Not enough spots remaining"), { statusCode: 400 });

    // ── 6. Wallet fetch — all 3 wallets ──
    const [[wallet]] = await conn.query(
      `SELECT depositwallet, bonusamount, earnwallet
       FROM wallets WHERE user_id = ? FOR UPDATE`,
      [userId]
    );
    if (!wallet)
      throw Object.assign(new Error("Wallet not found"), { statusCode: 400 });

    const totalFee = contestEntryFee * teamIds.length;
    const depositBal = Number(wallet.depositwallet);
    const bonusBal = Number(wallet.bonusamount);
    const earnBal = Number(wallet.earnwallet);

    // ── 7. Wallet deduction priority ──
    // Step A: max 5% from bonus wallet
    const bonusUsable = Number((totalFee * BONUS_MAX_PCT).toFixed(2));
    const bonusDeduct = Math.min(bonusUsable, bonusBal);
    // Step B: remaining after bonus
    const remainingAfterBonus = Number((totalFee - bonusDeduct).toFixed(2));
    // Step C: winning wallet first for remaining
    const earnDeduct = Math.min(earnBal, remainingAfterBonus);
    // Step D: rest from deposit
    const depositDeduct = Number((remainingAfterBonus - earnDeduct).toFixed(2));

    if (depositBal < depositDeduct)
      throw Object.assign(new Error("Insufficient balance"), { statusCode: 400 });

    // ── 8. Deduct from all 3 wallets ──
    await conn.query(
      `UPDATE wallets
       SET depositwallet = depositwallet - ?,
           bonusamount   = bonusamount   - ?,
           earnwallet    = earnwallet    - ?
       WHERE user_id = ?`,
      [depositDeduct, bonusDeduct, earnDeduct, userId]
    );

    // ── 9. Total user balance + company balance for proper ledger ──
    let userBalance = Number((depositBal + earnBal + bonusBal).toFixed(2));
    const [[companyLastRow]] = await conn.query(
      `SELECT closing_balance FROM wallet_transactions
       WHERE closing_balance IS NOT NULL ORDER BY id DESC LIMIT 1 FOR UPDATE`
    );
    let companyBalance = Number(companyLastRow?.closing_balance || 0);

    // ── 10. Wallet transaction — winning debit ──
    if (earnDeduct > 0) {
      const uOpen  = userBalance;
      const uClose = Number((userBalance - earnDeduct).toFixed(2));
      userBalance  = uClose;
      const coOpen  = companyBalance;
      const coClose = Number((companyBalance + earnDeduct).toFixed(2));
      companyBalance = coClose;
      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount,
          useropeningbalance, userclosingbalance,
          opening_balance, closing_balance, ip_address, device)
         VALUES (?, 'winning', 'debit', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, `Contest join fee (winnings) - Contest #${contestId}`,
          earnDeduct, uOpen, uClose, coOpen, coClose, ip || null, device || null]
      );
    }

    // ── 11. Wallet transaction — deposit debit ──
    if (depositDeduct > 0) {
      const uOpen  = userBalance;
      const uClose = Number((userBalance - depositDeduct).toFixed(2));
      userBalance  = uClose;
      const coOpen  = companyBalance;
      const coClose = Number((companyBalance + depositDeduct).toFixed(2));
      companyBalance = coClose;
      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount,
          useropeningbalance, userclosingbalance,
          opening_balance, closing_balance, ip_address, device)
         VALUES (?, 'deposit', 'debit', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, `Contest join fee - Contest #${contestId}`,
          depositDeduct, uOpen, uClose, coOpen, coClose, ip || null, device || null]
      );
    }

    // ── 12. Wallet transaction — bonus debit ──
    if (bonusDeduct > 0) {
      const uOpen  = userBalance;
      const uClose = Number((userBalance - bonusDeduct).toFixed(2));
      userBalance  = uClose;
      const coOpen  = companyBalance;
      const coClose = Number((companyBalance + bonusDeduct).toFixed(2));
      companyBalance = coClose;
      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount,
          useropeningbalance, userclosingbalance,
          opening_balance, closing_balance, ip_address, device)
         VALUES (?, 'bonus', 'debit', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, `Contest join bonus used - Contest #${contestId}`,
          bonusDeduct, uOpen, uClose, coOpen, coClose, ip || null, device || null]
      );
    }

    // ── 12. Insert into contest_entries for each team ──
    for (const teamId of teamIds) {
      await conn.query(
        `INSERT INTO contest_entries
         (contest_id, user_id, user_team_id, entry_fee, status, joined_at)
         VALUES (?, ?, ?, ?, 'active', NOW())`,
        [contestId, userId, teamId, contestEntryFee]
      );
    }

    // ── 13. Increment current_entries ──
    await conn.query(
      `UPDATE contest SET current_entries = current_entries + ? WHERE id = ?`,
      [teamIds.length, contestId]
    );

    // ── 14. Referral bonus — first paid contest join only ──
    if (contestEntryFee > 0) {
      await applyReferralContestBonus(
        userId, contestId, ip, device, conn,
        teamIds.length  // ✅ correctly pass చేశాం
      );
    }

    await conn.commit();

    logActivity({
      userId,
      type: "contest",
      title: "Contest Joined",
      description: `Joined Contest #${contestId} with ${teamIds.length} team(s)`,
      amount: totalFee,
      icon: "contest",
      meta: { contestId, teamsJoined: teamIds.length },
    });

    return {
      success: true,
      message: "Contest joined successfully",
      entryFee: contestEntryFee,
      teamsJoined: teamIds.length,
      totalPaid: totalFee,
      bonusUsed: bonusDeduct,
      earningUsed: earnDeduct,
      depositUsed: depositDeduct,
    };

  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
};

export const joinContestServicesudheer = async (userId, { contestId, userTeamId, ip, device }) => {
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();
    const [[contest]] = await conn.query(
      `SELECT id, entry_fee, max_entries, current_entries, status, match_id
       FROM contest WHERE id = ? FOR UPDATE`,
      [contestId]
    );

    if (!contest)
      throw Object.assign(new Error("Contest not found"), { statusCode: 404 });

    if (contest.status !== "UPCOMING")
      throw Object.assign(new Error("Contest is not open for joining"), { statusCode: 400 });

    if (contest.current_entries >= contest.max_entries)
      throw Object.assign(new Error("Contest is full"), { statusCode: 400 });

    const contestEntryFee = Number(contest.entry_fee);

    // ── 2. Normalize team IDs ──
    const teamIds = Array.isArray(userTeamId)
      ? userTeamId.map(Number)
      : [Number(userTeamId)];

    if (!teamIds.length)
      throw Object.assign(new Error("userTeamId is required"), { statusCode: 400 });

    // ── 3. Validate teams ──
    const [teamRows] = await conn.query(
      `SELECT id FROM user_teams
       WHERE id IN (?) AND user_id = ? AND match_id = ?`,
      [teamIds, userId, contest.match_id]
    );

    if (teamRows.length !== teamIds.length)
      throw Object.assign(new Error("One or more teams are invalid"), { statusCode: 400 });

    // ── 4. Duplicate check ──
    const [existingEntries] = await conn.query(
      `SELECT user_team_id FROM contest_entries
       WHERE contest_id = ? AND user_id = ? AND user_team_id IN (?)`,
      [contestId, userId, teamIds]
    );

    if (existingEntries.length > 0)
      throw Object.assign(new Error("One or more teams already joined this contest"), { statusCode: 400 });

    // ── 5. Check available spots ──
    const spotsLeft = contest.max_entries - contest.current_entries;
    if (teamIds.length > spotsLeft)
      throw Object.assign(new Error("Not enough spots remaining"), { statusCode: 400 });

    // ── 6. Wallet fetch ──
    const [[wallet]] = await conn.query(
      `SELECT depositwallet, bonusamount, earnwallet
       FROM wallets WHERE user_id = ? FOR UPDATE`,
      [userId]
    );

    if (!wallet)
      throw Object.assign(new Error("Wallet not found"), { statusCode: 400 });

    const totalFee = contestEntryFee * teamIds.length;
    const depositBal = Number(wallet.depositwallet);
    const bonusBal = Number(wallet.bonusamount);
    const earnBal = Number(wallet.earnwallet);

    // ── 7. Wallet deduction logic ──
    const bonusUsable = Number((totalFee * BONUS_MAX_PCT).toFixed(2));
    const bonusDeduct = Math.min(bonusUsable, bonusBal);

    const remainingAfterBonus = Number((totalFee - bonusDeduct).toFixed(2));

    const earnDeduct = Math.min(earnBal, remainingAfterBonus);
    const depositDeduct = Number((remainingAfterBonus - earnDeduct).toFixed(2));

    if (depositBal < depositDeduct)
      throw Object.assign(new Error("Insufficient balance"), { statusCode: 400 });

    // ── 8. Wallet update ──
    await conn.query(
      `UPDATE wallets
       SET depositwallet = depositwallet - ?,
           bonusamount   = bonusamount   - ?,
           earnwallet    = earnwallet    - ?
       WHERE user_id = ?`,
      [depositDeduct, bonusDeduct, earnDeduct, userId]
    );

    // ── 9. Bulk wallet transactions ──
    const walletTransactions = [];

    if (earnDeduct > 0) {
      walletTransactions.push([
        userId, 'winning', 'debit',
        `Contest join fee (winnings) - Contest #${contestId}`,
        earnDeduct,
        earnBal,
        Number((earnBal - earnDeduct).toFixed(2)),
        ip || null,
        device || null
      ]);
    }

    if (depositDeduct > 0) {
      walletTransactions.push([
        userId, 'deposit', 'debit',
        `Contest join fee - Contest #${contestId}`,
        depositDeduct,
        depositBal,
        Number((depositBal - depositDeduct).toFixed(2)),
        ip || null,
        device || null
      ]);
    }

    if (bonusDeduct > 0) {
      walletTransactions.push([
        userId, 'bonus', 'debit',
        `Contest join bonus used - Contest #${contestId}`,
        bonusDeduct,
        bonusBal,
        Number((bonusBal - bonusDeduct).toFixed(2)),
        ip || null,
        device || null
      ]);
    }

    if (walletTransactions.length) {
      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount,
          useropeningbalance, userclosingbalance, ip_address, device)
         VALUES ?`,
        [walletTransactions]
      );
    }

    // ── 10. 🚀 BULK INSERT contest entries ──
    const entryValues = teamIds.map(teamId => [
      contestId,
      userId,
      teamId,
      contestEntryFee,
      'active',
      new Date()
    ]);

    await conn.query(
      `INSERT INTO contest_entries
       (contest_id, user_id, user_team_id, entry_fee, status, joined_at)
       VALUES ?`,
      [entryValues]
    );

    // ── 11. Update contest count ──
    await conn.query(
      `UPDATE contest
       SET current_entries = current_entries + ?
       WHERE id = ?`,
      [teamIds.length, contestId]
    );

    // ── 12. Referral bonus ──
    if (contestEntryFee > 0) {
      await applyReferralContestBonus(userId, contestId, ip, device, conn);
    }

    await conn.commit();

    logActivity({
      userId,
      type: "contest",
      title: "Contest Joined",
      description: `Joined Contest #${contestId} with ${teamIds.length} team(s)`,
      amount: totalFee,
      icon: "contest",
      meta: { contestId, teamsJoined: teamIds.length },
    });

    return {
      success: true,
      message: "Contest joined successfully",
      entryFee: contestEntryFee,
      teamsJoined: teamIds.length,
      totalPaid: totalFee,
      bonusUsed: bonusDeduct,
      earningUsed: earnDeduct,
      depositUsed: depositDeduct,
    };

  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
};


// export const getMyContestsService = async (userId, matchId) => {
//   if (!userId) throw new Error("userId is required");
//   if (!matchId) throw new Error("matchId is required");

//   // ── Match details ──
//   const [[match]] = await db.query(
//     `SELECT
//        m.status, m.matchdate,
//        ht.name       AS home_team_name,
//        ht.short_name AS home_team_short_name,
//        at.name       AS away_team_name,
//        at.short_name AS away_team_short_name
//      FROM matches m
//      JOIN teams ht ON ht.id = m.home_team_id
//      JOIN teams at ON at.id = m.away_team_id
//      WHERE m.id = ?`,
//     [matchId]
//   );
//   if (!match) throw new Error("Match not found");

//   const matchStatus  = match.status?.toUpperCase();
//   const isLive       = matchStatus === "LIVE";
//   const isResult     = matchStatus === "RESULT";
//   const showAllTeams = isLive || isResult;

//   // ── User join అయిన contests ──
//   const [contestRows] = await db.query(
//     `SELECT
//        c.id                  AS contest_id,
//        c.match_id,
//        c.entry_fee,
//        c.prize_pool,
//        c.net_pool_prize,
//        c.max_entries,
//        c.current_entries,
//        c.contest_type,
//        c.status,
//        c.first_prize,
//        c.total_winners,
//        c.winner_percentage,
//        c.refund_start_rank,
//        c.refund_winners,
//        c.bonus_ranks,
//        c.platform_fee_percentage,
//        c.prize_distribution,
//        COUNT(ce.id) AS my_team_count
//      FROM contest_entries ce
//      JOIN contest c ON ce.contest_id = c.id
//      WHERE ce.user_id = ? AND c.match_id = ?
//      GROUP BY c.id
//      ORDER BY MAX(ce.id) DESC`,
//     [userId, matchId]
//   );

//   if (!contestRows?.length) return [];

//   const contestIds = contestRows.map(c => c.contest_id);

//   // ── My entries ──
//   const [myEntryRows] = await db.query(
//     `SELECT
//        ce.id           AS entry_id,
//        ce.contest_id,
//        ce.user_team_id,
//        ce.user_id,
//        ce.entry_fee,
//        ce.urank,
//        ce.winning_amount,
//        ce.status       AS entry_status,
//        ce.joined_at
//      FROM contest_entries ce
//      WHERE ce.user_id = ? AND ce.contest_id IN (?)`,
//     [userId, contestIds]
//   );

//   // ── Other entries — LIVE/RESULT లో మాత్రమే ──
//   let allEntryRows = [];
//   if (showAllTeams) {
//     const [rows] = await db.query(
//       `SELECT
//          ce.id           AS entry_id,
//          ce.contest_id,
//          ce.user_team_id,
//          ce.user_id,
//          ce.entry_fee,
//          ce.urank,
//          ce.winning_amount,
//          ce.status       AS entry_status,
//          ce.joined_at,
//          u.name          AS user_name,
//          u.nickname      AS user_nickname
//        FROM contest_entries ce
//        JOIN users u ON u.id = ce.user_id
//        WHERE ce.contest_id IN (?) AND ce.user_id != ?`,
//       [contestIds, userId]
//     );
//     allEntryRows = rows;
//   }

//   // ── Team IDs collect ──
//   const myTeamIds    = [...new Set(myEntryRows.map(e => e.user_team_id).filter(Boolean))];
//   const otherTeamIds = showAllTeams
//     ? [...new Set(allEntryRows.map(e => e.user_team_id).filter(Boolean))]
//     : [];
//   const allTeamIds   = [...new Set([...myTeamIds, ...otherTeamIds])];

//   // ── LIVE → Redis నుండి rank + points ──
//   let liveRankMap = {};
//   if (isLive) {
//     for (const cid of contestIds) {
//       try {
//         const cached = await redis.get(`LB:${cid}`);
//         if (cached && Array.isArray(cached)) {
//           cached.forEach(r => {
//             liveRankMap[r.user_team_id] = { rank: r.rank, points: r.points };
//           });
//         }
//       } catch (err) {
//         console.error(`Redis error for ${cid}:`, err.message);
//       }
//     }
//   }

//   // ── Teams + Players build ──
//   let teamsMap = {};

//   if (allTeamIds.length > 0) {
//     const [teamRows] = await db.query(
//       `SELECT
//          ut.id               AS team_id,
//          ut.user_id          AS team_owner_id,
//          ut.team_name,
//          ut.team_rank,
//          ut.locked,
//          ut.created_at,
//          utp.id              AS player_entry_id,
//          utp.player_id,
//          utp.is_captain,
//          utp.is_vice_captain,
//          utp.role,
//          utp.is_substitude,
//          p.name              AS player_name,
//          p.playerimage       AS player_image,
//          p.position,
//          p.playercredits,
//          p.flag_image,
//          p.country,
//          t.short_name        AS real_team_short_name,
//          COALESCE(pms.fantasy_points, 0) AS player_points
//        FROM user_teams ut
//        LEFT JOIN user_team_players utp ON utp.user_team_id = ut.id
//        LEFT JOIN players p             ON p.id = utp.player_id
//        LEFT JOIN teams t               ON t.id = p.team_id
//        LEFT JOIN player_match_stats pms
//               ON pms.player_id = utp.player_id
//              AND pms.match_id  = ?
//        WHERE ut.id IN (?)`,
//       [matchId, allTeamIds]
//     );

//     teamRows.forEach(row => {
//       if (!teamsMap[row.team_id]) {
//         teamsMap[row.team_id] = {
//           teamId:        row.team_id,
//           teamOwnerId:   row.team_owner_id,
//           teamName:      row.team_name   || null,
//           teamRank:      row.team_rank   || null,
//           locked:        row.locked === 1,
//           createdAt:     row.created_at  || null,
//           totalPoints:   0,
//           totalCredits:  0,
//           creditsLeft:   100,
//           players:       [],
//         };
//       }

//       if (row.player_entry_id) {
//         const credits    = parseFloat(row.playercredits) || 0;
//         const basePoints = parseFloat(row.player_points) || 0;

//         // ── LIVE: no captain multiplier (document spec) ──
//         // ── RESULT: captain/VC multiplier apply ──
//         const multiplier   = isResult
//           ? (row.is_captain ? 2 : row.is_vice_captain ? 1.5 : 1)
//           : 1;
//         const effectivePts = parseFloat((basePoints * multiplier).toFixed(2));

//         teamsMap[row.team_id].players.push({
//           playerEntryId:      row.player_entry_id,
//           playerId:           row.player_id,
//           playerName:         row.player_name          || null,
//           playerImage:        row.player_image         || null,
//           position:           row.position             || null,
//           credits,
//           flagImage:          row.flag_image           || null,
//           country:            row.country              || null,
//           realTeamShortName:  row.real_team_short_name || null,
//           role:               row.role                 || null,
//           isCaptain:          row.is_captain      === 1,
//           isViceCaptain:      row.is_vice_captain === 1,
//           isSubstitute:       row.is_substitude   === 1,
//           basePoints,
//           effectivePoints:    effectivePts,
//           highestScorerBonus: 0,
//         });

//         teamsMap[row.team_id].totalPoints  += effectivePts;
//         teamsMap[row.team_id].totalCredits += credits;
//       }
//     });

//     // Credits finalize
//     Object.values(teamsMap).forEach(team => {
//       team.totalPoints  = parseFloat(team.totalPoints.toFixed(2));
//       team.totalCredits = parseFloat(team.totalCredits.toFixed(2));
//       team.creditsLeft  = parseFloat((100 - team.totalCredits).toFixed(2));
//     });

  
//     // LIVE లో HS Bonus వద్దు
//    // తర్వాత: ✅ match-level max — అన్ని teams players లో max
// if (isResult) {
//   // ── Match-level max calculate చేయి ──
//   let matchMaxBase = 0;
//   Object.values(teamsMap).forEach(team => {
//     team.players.forEach(p => {
//       if (p.basePoints > matchMaxBase) matchMaxBase = p.basePoints;
//     });
//   });

//   // ── అన్ని teams లో apply చేయి ──
//   Object.values(teamsMap).forEach(team => {
//     if (!team.players.length) return;
//     if (matchMaxBase <= 0) return;

//     team.players = team.players.map(p => {
//       if (p.basePoints !== matchMaxBase) return p;
//       const hsBonus      = p.isSubstitute ? 8 : 4;
//       const newBase      = p.basePoints + hsBonus;
//       const newEffective = parseFloat(
//         (newBase * (p.isCaptain ? 2 : p.isViceCaptain ? 1.5 : 1)).toFixed(2)
//       );
//       return { ...p, basePoints: newBase, effectivePoints: newEffective, highestScorerBonus: hsBonus };
//     });

//     team.totalPoints = parseFloat(
//       team.players.reduce((sum, p) => sum + p.effectivePoints, 0).toFixed(2)
//     );
//   });
// }
//   }

//   // ── Entries group by contest ──
//   const myEntriesByContest    = {};
//   const otherEntriesByContest = {};

//   myEntryRows.forEach(e => {
//     if (!myEntriesByContest[e.contest_id]) myEntriesByContest[e.contest_id] = [];
//     myEntriesByContest[e.contest_id].push(e);
//   });

//   if (showAllTeams) {
//     allEntryRows.forEach(e => {
//       if (!otherEntriesByContest[e.contest_id]) otherEntriesByContest[e.contest_id] = [];
//       otherEntriesByContest[e.contest_id].push(e);
//     });
//   }

//   const computedResultRankByContest = {};
//   if (isResult) {
//     contestRows.forEach(c => {
//       const contestId = c.contest_id;
//       const contestEntries = [
//         ...(myEntriesByContest[contestId] || []),
//         ...(otherEntriesByContest[contestId] || []),
//       ];

//       const uniqueByTeam = new Map();
//       contestEntries.forEach(e => {
//         const teamId = e.user_team_id;
//         if (!teamId || uniqueByTeam.has(teamId)) return;
//         uniqueByTeam.set(teamId, {
//           userTeamId: teamId,
//           points: Number(teamsMap[teamId]?.totalPoints ?? 0),
//         });
//       });

//       computedResultRankByContest[contestId] = buildCompetitionRankMap(
//         [...uniqueByTeam.values()]
//       );
//     });
//   }

//   // ── Format entry ──
//   const formatEntry = (e, isOwn, c) => {
//     const team    = teamsMap[e.user_team_id] || null;
//     let   players = team?.players || [];

//     if (!isOwn && !showAllTeams) {
//       players = players.map(p => ({ ...p, isCaptain: false, isViceCaptain: false }));
//     }

//     // ── Rank ──
//     let rank = null;
//     if (isResult) {
//       rank =
//         computedResultRankByContest[c.contest_id]?.[e.user_team_id] ??
//         e.urank ??
//         null;
//     }
//     else if (isLive) rank = liveRankMap[e.user_team_id]?.rank ?? null;

//     // ── Points ──
//     // LIVE → Redis నుండి (base points only, no captain/HS)
//     // RESULT → teamsMap నుండి (full calculation with captain/HS)
//     let totalPoints = 0;
//     if (isResult) {
//       totalPoints = team?.totalPoints || 0;
//     } else if (isLive) {
//       totalPoints = liveRankMap[e.user_team_id]?.points ?? team?.totalPoints ?? 0;
//     }

//     // ── Winning Amount — COMPLETED లో మాత్రమే ──
//     const contestStatus = c.status?.toUpperCase();
//     const showWinning   = contestStatus === "COMPLETED";
//     const rankForPrize = e.urank ?? rank;
//     const winningAmount = showWinning
//       ? (Number(e.winning_amount) || getPrizeForRank(
//            rankForPrize,
//            c.prize_distribution ?? null,
//            c.entry_fee,
//            c.refund_winners,
//            c.refund_start_rank
//          ))
//       : 0;

//     return {
//       entryId:       e.entry_id,
//       userId:        e.user_id,
//       userName:      e.user_name      || null,
//       userNickname:  e.user_nickname  || null,
//       isMyEntry:     isOwn,
//       entryFee:      Number(e.entry_fee) || 0,
//       rank,
//       totalPoints,
//       winningAmount,
//       entryStatus:   e.entry_status   || null,
//       joinedAt:      e.joined_at      || null,
//       teamId:        team?.teamId     || null,
//       teamName:      team?.teamName   || null,
//       teamRank:      team?.teamRank   || null,
//       locked:        team?.locked     ?? null,
//       totalCredits:  team?.totalCredits  || 0,
//       creditsLeft:   team?.creditsLeft   ?? 100,
//       players,
//     };
//   };

//   // ── Final response ──
//   return contestRows.map(c => {
//     const myEntries    = (myEntriesByContest[c.contest_id]    || []).map(e => formatEntry(e, true,  c));
//     const otherEntries = (otherEntriesByContest[c.contest_id] || []).map(e => formatEntry(e, false, c));

//     return {
//       contest_id:              c.contest_id,
//       match_id:                c.match_id,
//       match_status:            matchStatus,
//       match_date:              match.matchdate               || null,
//       home_team_name:          match.home_team_name          || null,
//       home_team_short_name:    match.home_team_short_name    || null,
//       away_team_name:          match.away_team_name          || null,
//       away_team_short_name:    match.away_team_short_name    || null,
//       entry_fee:               Number(c.entry_fee)               || 0,
//       prize_pool:              Number(c.prize_pool)              || 0,
//       net_pool_prize:          Number(c.net_pool_prize)          || 0,
//       max_entries:             c.max_entries                     || 0,
//       current_entries:         c.current_entries                 || 0,
//       remaining_spots:         Math.max((c.max_entries || 0) - (c.current_entries || 0), 0),
//       contest_type:            c.contest_type                    || null,
//       status:                  c.status                          || null,
//       first_prize:             Number(c.first_prize)             || 0,
//       total_winners:           c.total_winners                   || 0,
//       refund_start_rank:       c.refund_start_rank               || 0,
//       bonus_ranks:             c.bonus_ranks                     || 0,
//       winner_percentage:       Number(c.winner_percentage)       || 0,
//       platform_fee_percentage: Number(c.platform_fee_percentage) || 0,
//       my_team_count:           Number(c.my_team_count)           || 0,
//       my_teams:                myEntries,
//       other_teams:             showAllTeams ? otherEntries : [],
//     };
//   });
// };

// ─────────────────────────────────────────────────────────────────────────────
// COMPARE TEAM
// ─────────────────────────────────────────────────────────────────────────────


export const getMyContestsService = async (userId, matchId) => {
  if (!userId) throw new Error("userId is required");
  if (!matchId) throw new Error("matchId is required");

  // ── Match details ──
  const [[match]] = await db.query(
    `SELECT
       m.status, m.matchdate,
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

  const matchStatus = match.status?.toUpperCase();

  // ── User joined contests ──
  const [contestRows] = await db.query(
    `SELECT
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
       COUNT(ce.id)          AS my_team_count
     FROM contest_entries ce
     JOIN contest c ON ce.contest_id = c.id
     WHERE ce.user_id = ? AND c.match_id = ?
     GROUP BY c.id
     ORDER BY MAX(ce.id) DESC`,
    [userId, matchId]
  );

  if (!contestRows?.length) return [];

  // ── My team names only ──
  const contestIds = contestRows.map(c => c.contest_id);

  const [teamRows] = await db.query(
    `SELECT
       ce.contest_id,
       ut.team_name
     FROM contest_entries ce
     JOIN user_teams ut ON ut.id = ce.user_team_id
     WHERE ce.user_id = ? AND ce.contest_id IN (?)`,
    [userId, contestIds]
  );

  // Group team names by contest
  const teamNamesByContest = {};
  teamRows.forEach(row => {
    if (!teamNamesByContest[row.contest_id]) teamNamesByContest[row.contest_id] = [];
    teamNamesByContest[row.contest_id].push(row.team_name || null);
  });

  // ── Final response ──
  return contestRows.map(c => ({
    contest_id:       c.contest_id,
    match_id:         c.match_id,
    match_status:     matchStatus,
    match_date:       match.matchdate            || null,
    home_team_name:   match.home_team_name       || null,
    home_team_short_name: match.home_team_short_name || null,
    away_team_name:   match.away_team_name       || null,
    away_team_short_name: match.away_team_short_name || null,
    entry_fee:        Number(c.entry_fee)        || 0,
    prize_pool:       Number(c.prize_pool)       || 0,
    max_entries:      c.max_entries              || 0,
    current_entries:  c.current_entries          || 0,
    contest_type:     c.contest_type             || null,
    status:           c.status                   || null,
    first_prize:      Number(c.first_prize)      || 0,
    total_winners:    c.total_winners            || 0,
    my_team_count:    Number(c.my_team_count)    || 0,
    my_teams:         teamNamesByContest[c.contest_id] || [],
  }));
};


const getTeamPlayers = async (userTeamId, matchId) => {
  const [rows] = await db.query(
    `SELECT
       utp.player_id, utp.is_captain, utp.is_vice_captain,
       p.name AS player_name, p.playerimage AS player_image,
       p.player_type AS player_role, p.playercredits AS player_credits,
       t.short_name AS team_short,
       COALESCE(pms.fantasy_points, 0) AS base_points,
       COALESCE(utp.points, 0)         AS final_points  -- ✅ add చేయి
     FROM user_team_players utp
     JOIN players p  ON p.id = utp.player_id
     LEFT JOIN teams t ON t.id = p.team_id
     LEFT JOIN player_match_stats pms
           ON pms.player_id = utp.player_id AND pms.match_id = ?
     WHERE utp.user_team_id = ?`,
    [matchId, userTeamId]
  );

  return rows.map(r => {
    const multiplier = r.is_captain ? 2 : r.is_vice_captain ? 1.5 : 1;
    return {
      player_id:      r.player_id,
      player_name:    r.player_name,
      player_image:   r.player_image   || null,
      player_role:    r.player_role    || null,
      player_credits: r.player_credits || null,
      team_short:     r.team_short     || null,
      is_captain:     !!r.is_captain,
      is_vice_captain: !!r.is_vice_captain,
      base_points:    parseFloat(r.base_points),
      multiplier,
      // ✅ utp.points use చేయి (HS Bonus included)
      effective_points: parseFloat(r.final_points) || parseFloat((r.base_points * multiplier).toFixed(2)),
    };
  });
};

export const compareTeamService = async (contestId, myTeamId, oppTeamId, userId) => {
  const [[contest]] = await db.query(
    `SELECT c.id, c.match_id, c.prize_distribution,
            c.entry_fee, c.total_winners, c.refund_start_rank
     FROM contest c WHERE c.id = ?`,
    [contestId]
  );
  if (!contest) return { success: false, message: "Contest not found" };

  const [teamRows] = await db.query(
    `SELECT ce.user_team_id, ce.user_id, ce.urank, ce.winning_amount,
            ut.team_name, u.name, u.nickname, u.image
     FROM contest_entries ce
     JOIN user_teams ut ON ut.id = ce.user_team_id
     JOIN users     u  ON u.id  = ce.user_id
     WHERE ce.contest_id = ? AND ce.user_team_id IN (?)`,
    [contestId, [myTeamId, oppTeamId]]
  );

  const myMeta = teamRows.find(r => r.user_team_id === parseInt(myTeamId));
  const oppMeta = teamRows.find(r => r.user_team_id === parseInt(oppTeamId));
  if (!myMeta || !oppMeta)
    return { success: false, message: "One or both teams not found in this contest" };

  const [myPlayers, oppPlayers] = await Promise.all([
    getTeamPlayers(myTeamId, contest.match_id),
    getTeamPlayers(oppTeamId, contest.match_id),
  ]);

  const myIds = new Set(myPlayers.map(p => p.player_id));
  const oppIds = new Set(oppPlayers.map(p => p.player_id));

  const myOnlyPlayers = myPlayers.filter(p => !oppIds.has(p.player_id));
  const oppOnlyPlayers = oppPlayers.filter(p => !myIds.has(p.player_id));
  const commonPlayerIds = [...myIds].filter(id => oppIds.has(id));

  const commonPlayers = commonPlayerIds.map(pid => {
    const mine = myPlayers.find(p => p.player_id === pid);
    const theirs = oppPlayers.find(p => p.player_id === pid);
    return {
      player_id: pid,
      player_name: mine.player_name,
      player_image: mine.player_image,
      player_role: mine.player_role,
      team_short: mine.team_short,
      base_points: mine.base_points,
      my_is_captain: mine.is_captain,
      my_is_vice_captain: mine.is_vice_captain,
      my_multiplier: mine.multiplier,
      my_effective_points: mine.effective_points,
      opp_is_captain: theirs.is_captain,
      opp_is_vice_captain: theirs.is_vice_captain,
      opp_multiplier: theirs.multiplier,
      opp_effective_points: theirs.effective_points,
      caps_differ: mine.multiplier !== theirs.multiplier,
    };
  });

  const commonSameCaps = commonPlayers.filter(p => !p.caps_differ);
  const commonDiffCaps = commonPlayers.filter(p => p.caps_differ);
  const myTotal = myPlayers.reduce((s, p) => s + p.effective_points, 0);
  const oppTotal = oppPlayers.reduce((s, p) => s + p.effective_points, 0);
  const myDiffTotal = myOnlyPlayers.reduce((s, p) => s + p.effective_points, 0);
  const oppDiffTotal = oppOnlyPlayers.reduce((s, p) => s + p.effective_points, 0);
  const myDiffCapsTotal = commonDiffCaps.reduce((s, p) => s + p.my_effective_points, 0);
  const oppDiffCapsTotal = commonDiffCaps.reduce((s, p) => s + p.opp_effective_points, 0);
  const commonSameTotal = commonSameCaps.reduce((s, p) => s + p.my_effective_points, 0);

  return {
    success: true,
    my_team: {
      user_team_id: myMeta.user_team_id, team_name: myMeta.team_name,
      username: myMeta.nickname || myMeta.name, profile_image: myMeta.image || null,
      rank: myMeta.urank, total_points: parseFloat(myTotal.toFixed(2)),
    },
    opp_team: {
      user_team_id: oppMeta.user_team_id, team_name: oppMeta.team_name,
      username: oppMeta.nickname || oppMeta.name, profile_image: oppMeta.image || null,
      rank: oppMeta.urank, total_points: parseFloat(oppTotal.toFixed(2)),
    },
  point_diff: parseFloat((myTotal - oppTotal).toFixed(2)),  
    different_players: {
      my_players: myOnlyPlayers, opp_players: oppOnlyPlayers,
      my_diff_total: parseFloat(myDiffTotal.toFixed(2)),
      opp_diff_total: parseFloat(oppDiffTotal.toFixed(2)),
     diff_point_gap: parseFloat((myDiffTotal - oppDiffTotal).toFixed(2)),  
    },
    common_diff_caps: {
      players: commonDiffCaps,
      my_caps_total: parseFloat(myDiffCapsTotal.toFixed(2)),
      opp_caps_total: parseFloat(oppDiffCapsTotal.toFixed(2)),
      diff_point_gap: parseFloat((myDiffCapsTotal - oppDiffCapsTotal).toFixed(2)),
    },
    common_same_caps: {
      players: commonSameCaps,
      total_points: parseFloat(commonSameTotal.toFixed(2)),
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────


export const getLeaderboardService = async (contestId, userId, page = 1, limit = 50) => {
  const offset = (page - 1) * limit;

  const [[contest]] = await db.query(
    `SELECT
       c.id, c.match_id, c.prize_pool, c.net_pool_prize,
       c.first_prize, c.prize_distribution,
       c.current_entries, c.max_entries, c.min_entries,
       c.entry_fee, c.status, c.is_guaranteed,
       c.contest_type, c.winner_percentage,
       c.bonus_ranks, c.refund_start_rank, c.refund_winners,
       c.refund_total, c.netpool_amount,
       c.rank1_percent, c.top1_end_rank,
       c.linear_start_rank, c.linear_end_rank,
       m.status    AS match_status,
       m.seriesname, m.hometeamname, m.awayteamname,
       m.matchdate, m.start_time
     FROM contest c
     JOIN matches m ON m.id = c.match_id
     WHERE c.id = ?`,
    [contestId]
  );
  if (!contest) return { success: false, message: "Contest not found" };

  const matchStatus   = contest.match_status?.toUpperCase();
  const contestStatus = contest.status?.toUpperCase();

  console.log(`Contest ${contestId} — matchStatus: ${matchStatus}, contestStatus: ${contestStatus}`);

  // ── UPCOMING ──
  if (matchStatus === "UPCOMING") {
    return {
      success:     true,
      contest:     { id: contest.id, match_status: matchStatus, status: contestStatus },
      leaderboard: [],
      my_entries:  [],
      message:     "Match has not started yet",
    };
  }

  // ── LIVE → Redis cache ──
  if (matchStatus === "LIVE") {
    try {
      const cached = await redis.get(lbKey(contestId));
      if (cached && Array.isArray(cached)) {
        const allRanked = cached;
        const total     = allRanked.length;

        // ── my_entries — నీ అన్ని teams ──
        const my_entries = userId
          ? allRanked
              .filter(e => e.user_id === parseInt(userId))
              .map(e => ({
                user_team_id:   e.user_team_id,
                team_name:      e.team_name     || null,
                username:       e.username,
                profile_image:  e.profile_image || null,
                rank:           e.rank,
                points:         e.points,
                winning_amount: 0,
                is_winner:      false,
              }))
          : [];

        // ── leaderboard — other users  ──
        const otherRanked = allRanked.filter(e =>
          userId ? e.user_id !== parseInt(userId) : true
        );
        const paginated   = otherRanked.slice(offset, offset + limit);
        const leaderboard = paginated.map(e => ({
          ...e,
          winning_amount: 0,
          is_winner:      false,
          is_me:          false,
        }));

        return buildLeaderboardResponse(
          contest, matchStatus, leaderboard, my_entries, total, page, limit, offset
        );
      }
    } catch (err) {
      console.error("Redis leaderboard error:", err.message);
    }
  }

  // ── RESULT (INREVIEW / COMPLETED) → DB ──
  const [entries] = await db.query(
    `SELECT
       ce.id, ce.user_id, ce.user_team_id, ce.urank,
       ce.winning_amount, ce.status,
       u.name, u.nickname, u.image, ut.team_name,
       COALESCE(
         (SELECT SUM(utp.points)
          FROM user_team_players utp
          WHERE utp.user_team_id = ce.user_team_id
         ), 0
       ) AS computed_points,
       DENSE_RANK() OVER (
         ORDER BY COALESCE(
           (SELECT SUM(utp2.points)
            FROM user_team_players utp2
            WHERE utp2.user_team_id = ce.user_team_id
           ), 0
         ) DESC
       ) AS computed_rank
     FROM contest_entries ce
     JOIN users           u  ON u.id  = ce.user_id
     LEFT JOIN user_teams ut ON ut.id = ce.user_team_id
     WHERE ce.contest_id = ?
     ORDER BY computed_points DESC
     LIMIT ? OFFSET ?`,
    [contestId, limit, offset]
  );

  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total FROM contest_entries WHERE contest_id = ?`,
    [contestId]
  );

  // ── pointsMap ──
  const teamIds = entries.map(e => e.user_team_id).filter(Boolean);
  let pointsMap = {};
  if (teamIds.length > 0) {
    const [pointsRows] = await db.query(
      `SELECT utp.user_team_id, SUM(utp.points) AS total_points
       FROM user_team_players utp
       WHERE utp.user_team_id IN (?)
       GROUP BY utp.user_team_id`,
      [teamIds]
    );
    pointsRows.forEach(r => {
      pointsMap[r.user_team_id] = parseFloat(r.total_points || 0);
    });
  }

  const isCompleted = contestStatus === 'COMPLETED';

  // ── leaderboard — other users మాత్రమే ──
  const leaderboard = entries
    .filter(e => userId ? e.user_id !== parseInt(userId) : true)
    .map(entry => {
      const points = parseFloat(entry.computed_points) || 0;
      const rank   = entry.urank ?? entry.computed_rank;
      const prize  = isCompleted
        ? (Number(entry.winning_amount) || getPrizeForRank(
            rank, contest.prize_distribution,
            contest.entry_fee, contest.refund_winners, contest.refund_start_rank
          ))
        : 0;
      return {
        rank,
        user_id:        entry.user_id,
        username:       entry.nickname || entry.name || `User${entry.user_id}`,
        profile_image:  entry.image    || null,
        team_name:      entry.team_name || null,
        user_team_id:   entry.user_team_id,
        points,
        winning_amount: prize,
        is_winner:      prize > 0,
        is_me:          false,
      };
    });

  // ── my_entries — నీ అన్ని teams ──
  let my_entries = [];
  if (userId) {
    const [myEntries] = await db.query(
      `SELECT
         ce.user_team_id, ce.urank, ce.winning_amount,
         ut.team_name, u.name, u.nickname, u.image
       FROM contest_entries ce
       LEFT JOIN user_teams ut ON ut.id = ce.user_team_id
       LEFT JOIN users      u  ON u.id  = ce.user_id
       WHERE ce.contest_id = ? AND ce.user_id = ?`,
      [contestId, userId]
    );

    my_entries = myEntries.map(e => {
      const myPoints  = pointsMap[e.user_team_id] ?? 0;
      const myLbEntry = entries.find(l => l.user_team_id === e.user_team_id);
      const myRank    = e.urank ?? myLbEntry?.computed_rank ?? null;
      const myPrize   = isCompleted
        ? (Number(e.winning_amount) || getPrizeForRank(
            myRank, contest.prize_distribution,
            contest.entry_fee, contest.refund_winners, contest.refund_start_rank
          ))
        : 0;
      return {
        user_team_id:   e.user_team_id,
        team_name:      e.team_name    || null,
        username:       e.nickname || e.name || `User${userId}`,
        profile_image:  e.image        || null,
        rank:           myRank,
        points:         myPoints,
        winning_amount: myPrize,
        is_winner:      myPrize > 0,
      };
    });
  }

  return buildLeaderboardResponse(
    contest, matchStatus, leaderboard, my_entries, parseInt(total), page, limit, offset
  );
};


const buildLeaderboardResponse = (contest, matchStatus, leaderboard, my_entries, totalEntries, page, limit, offset) => {
  let prizeTiers = [];
  try {
    prizeTiers = typeof contest.prize_distribution === "string"
      ? JSON.parse(contest.prize_distribution)
      : contest.prize_distribution || [];
  } catch { prizeTiers = []; }

  return {
    success: true,
    contest: {
      id:                contest.id,
      prize_pool:        Number(contest.prize_pool)        || 0,
      net_pool_prize:    Number(contest.net_pool_prize)    || 0,
      first_prize:       Number(contest.first_prize)       || 0,
      entry_fee:         Number(contest.entry_fee)         || 0,
      total_entries:     contest.current_entries           || 0,
      total_spots:       contest.max_entries               || 0,
      min_entries:       contest.min_entries               || 0,
      is_guaranteed:     contest.is_guaranteed             === 1,
      total_winners:     contest.refund_winners            || 0,
      refund_start_rank: contest.refund_start_rank         || 0,
      bonus_ranks:       contest.bonus_ranks               || 0,
      rank1_percent:     Number(contest.rank1_percent)     || 0,
      top1_end_rank:     contest.top1_end_rank             || 0,
      linear_start_rank: contest.linear_start_rank         || 0,
      linear_end_rank:   contest.linear_end_rank           || 0,
      winner_percentage: Number(contest.winner_percentage) || 0,
      contest_type:      contest.contest_type              || null,
      status:            contest.status                    || null,
      match_status:      matchStatus,
      series_name:       contest.seriesname                || null,
      home_team:         contest.hometeamname              || null,
      away_team:         contest.awayteamname              || null,
      match_date:        contest.matchdate                 || null,
      start_time:        contest.start_time                || null,
      prize_tiers:       prizeTiers,
    },
    refund_zone: {
      rank_from: contest.refund_start_rank || 0,
      rank_to:   contest.refund_winners    || 0,
      prize:     Number(contest.entry_fee) || 0,
      label:     "Entry fee return",
    },
    no_prize_zone: {
      rank_from: (contest.refund_winners || 0) + 1,
      rank_to:   contest.max_entries     || 0,
      prize:     0,
      label:     "No prize",
    },
    my_entries,
    leaderboard,
    pagination: {
      current_page:  page,
      per_page:      limit,
      total_entries: totalEntries,
      total_pages:   Math.ceil(totalEntries / limit),
      has_more:      offset + limit < totalEntries,
    },
  };
};


// MY RANK
// ─────────────────────────────────────────────────────────────────────────────

export const getMyRankService = async (contestId, userId, userTeamId) => {
  const [[contest]] = await db.query(
    `SELECT id, match_id, prize_pool, first_prize,
            prize_distribution, current_entries, entry_fee,
            status, refund_winners, refund_start_rank
     FROM contest WHERE id = ?`,
    [contestId]
  );
  if (!contest) return { success: false, message: "Contest not found" };

  const [[entry]] = await db.query(
    `SELECT ce.id, ce.user_team_id, ce.urank, ce.winning_amount,
            u.name, u.nickname, u.image
     FROM contest_entries ce
     JOIN users u ON u.id = ce.user_id
     WHERE ce.contest_id = ? AND ce.user_id = ? AND ce.user_team_id = ?`,
    [contestId, userId, userTeamId]
  );
  if (!entry) return { success: false, message: "Team not found in this contest" };

  const points = await calcTeamPoints(entry.user_team_id, contest.match_id);

  const prize = entry.winning_amount || getPrizeForRank(
    entry.urank, contest.prize_distribution, contest.entry_fee,
    contest.refund_winners, contest.refund_start_rank
  );

  return {
    success: true,
    user_id: parseInt(userId),
    username: entry.nickname || entry.name || `User${userId}`,
    profile_image: entry.image || null,
    user_team_id: entry.user_team_id,
    rank: entry.urank,
    points,
    winning_amount: prize,
    is_winner: prize > 0,
    total_entries: contest.current_entries,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SCORE BREAKDOWN
// ─────────────────────────────────────────────────────────────────────────────

export const getScoreBreakdownService = async (contestId, userTeamId, matchId) => {
  if (!contestId || !userTeamId || !matchId)
    throw new Error("contestId, userTeamId, and matchId are required");

  const [teamPlayers] = await db.query(
    `SELECT
       utp.player_id       AS playerId,
       utp.is_captain      AS isCaptain,
       utp.is_vice_captain AS isViceCaptain,
       p.name, p.position, p.playerimage AS image
     FROM user_team_players utp
     JOIN players p ON p.id = utp.player_id
     WHERE utp.user_team_id = ?`,
    [userTeamId]
  );
  if (!teamPlayers.length) throw new Error("Team not found");

  const playerIds = teamPlayers.map(p => p.playerId);
  const allStats = await fetchPlayerStats(matchId, playerIds);
  const statsMap = {};
  allStats.forEach(s => { statsMap[s.playerId] = s; });

  const captainId = teamPlayers.find(p => p.isCaptain)?.playerId || null;
  const viceCaptainId = teamPlayers.find(p => p.isViceCaptain)?.playerId || null;

  const playerStatsList = teamPlayers.map(p => statsMap[p.playerId]).filter(Boolean);
  const result = calculateTeamPoints(playerStatsList, captainId, viceCaptainId);

  const playersWithInfo = result.players.map(scored => {
    const info = teamPlayers.find(p => p.playerId === scored.playerId) || {};
    return {
      playerId: scored.playerId,
      name: info.name || null,
      image: info.image || null,
      position: info.position || null,
      isCaptain: info.isCaptain === 1,
      isViceCaptain: info.isViceCaptain === 1,
      basePoints: scored.basePoints,
      finalPoints: scored.finalPoints,
      breakdown: scored.breakdown,
    };
  });

  return { success: true, userTeamId, teamTotal: result.teamTotal, players: playersWithInfo };
};


// services/admin/announceWinnersService.js


export const announceWinnersService = async (contestId, adminId) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // ── 1. Contest fetch ──
    const [[contest]] = await conn.query(
      `SELECT id, status, entry_fee, prize_pool,
              prize_distribution, refund_winners, refund_start_rank
       FROM contest WHERE id = ? FOR UPDATE`,
      [contestId]
    );
    if (!contest)
      throw Object.assign(new Error("Contest not found"), { statusCode: 404 });

    // ── 2. Only INREVIEW contest announce 
    if (contest.status === "COMPLETED")
      throw Object.assign(new Error("Winners already announced"), { statusCode: 400 });
    if (contest.status !== "INREVIEW")
      throw Object.assign(new Error(`Contest is in '${contest.status}' status. Only INREVIEW contests can be announced`), { statusCode: 400 });

    // ── Backfill urank if still null (safety for legacy unscored rows) ──
    await conn.query(
      `UPDATE contest_entries ce
       JOIN (
         SELECT
           ce2.id,
           DENSE_RANK() OVER (
             ORDER BY COALESCE(team_pts.total_points, 0) DESC
           ) AS computed_rank
         FROM contest_entries ce2
         LEFT JOIN (
           SELECT
             utp.user_team_id,
             SUM(COALESCE(utp.points, 0)) AS total_points
           FROM user_team_players utp
           GROUP BY utp.user_team_id
         ) team_pts ON team_pts.user_team_id = ce2.user_team_id
         WHERE ce2.contest_id = ?
       ) ranked ON ranked.id = ce.id
       SET ce.urank = ranked.computed_rank
       WHERE ce.contest_id = ? AND ce.urank IS NULL`,
      [contestId, contestId]
    );

    // ── 3. Already scored entries fetch (saveScoreResults లో already save అయ్యాయి) ──
    const [winners] = await conn.query(
      `SELECT 
         ce.id AS entry_id,
         ce.user_id,
         ce.user_team_id,
         ce.urank,
         ce.winning_amount,
         ce.entry_fee
       FROM contest_entries ce
       WHERE ce.contest_id = ?
         AND ce.winning_amount > 0
       ORDER BY ce.urank ASC`,
      [contestId]
    );

    const [allEntries] = await conn.query(
      `SELECT COUNT(*) AS total FROM contest_entries WHERE contest_id = ?`,
      [contestId]
    );

    // ── 4. Company balance for chaining across all winner credits ──
    const [[companyLastRow]] = await conn.query(
      `SELECT closing_balance FROM wallet_transactions
       WHERE closing_balance IS NOT NULL ORDER BY id DESC LIMIT 1 FOR UPDATE`
    );
    let companyBalance = Number(companyLastRow?.closing_balance || 0);

    // ── 5. Credit earnwallet for each winner ──
    for (const winner of winners) {
      const prize = Number(winner.winning_amount);
      if (!prize || prize <= 0) continue;

      // Wallet fetch — total balance for proper ledger
      const [[wallet]] = await conn.query(
        `SELECT earnwallet, depositwallet, bonusamount FROM wallets WHERE user_id = ? FOR UPDATE`,
        [winner.user_id]
      );
      if (!wallet) continue;

      const totalBal = Number(wallet.earnwallet) + Number(wallet.depositwallet) + Number(wallet.bonusamount);
      const openBal  = parseFloat(totalBal.toFixed(2));
      const closeBal = parseFloat((totalBal + prize).toFixed(2));

      const coOpen  = companyBalance;
      const coClose = Number((companyBalance - prize).toFixed(2));
      companyBalance = coClose;

      // Credit earnwallet
      await conn.query(
        `UPDATE wallets SET earnwallet = earnwallet + ? WHERE user_id = ?`,
        [prize, winner.user_id]
      );

      // Wallet transaction log
      await conn.query(
        `INSERT INTO wallet_transactions
         (user_id, wallettype, transtype, remark, amount,
          useropeningbalance, userclosingbalance,
          opening_balance, closing_balance)
         VALUES (?, 'winning', 'credit', ?, ?, ?, ?, ?, ?)`,
        [
          winner.user_id,
          `Contest #${contestId} — Rank ${winner.urank} prize won`,
          prize,
          openBal, closeBal,
          coOpen, coClose,
        ]
      );
    }

    // ── 6. Contest COMPLETED ──
    await conn.query(
      `UPDATE contest SET status = 'COMPLETED' WHERE id = ?`,
      [contestId]
    );

    await conn.commit();

    // ── 7. Log activity for each winner ──
    for (const winner of winners) {
      if (!winner.winning_amount) continue;
      logActivity({
        userId: winner.user_id,
        type: "winning",
        title: "Contest Prize Credited",
        description: `Rank ${winner.urank} in Contest #${contestId} — ₹${winner.winning_amount} credited`,
        amount: Number(winner.winning_amount),
        icon: "trophy",
        meta: { contestId, rank: winner.urank, userTeamId: winner.user_team_id },
      });
    }

    // ── 7. Clear Redis cache ──
    try {
      await redis.del(`LB:${contestId}`);
    } catch (e) {
      console.error("Redis clear error:", e.message);
    }

    return {
      success: true,
      message: "Winners announced & prizes credited successfully",
      contestId,
      totalEntries: allEntries[0].total,
      totalWinners: winners.length,
      totalPrizeDistributed: parseFloat(
        winners.reduce((s, w) => s + Number(w.winning_amount), 0).toFixed(2)
      ),
      winners: winners.map(w => ({
        userId:        w.user_id,
        userTeamId:    w.user_team_id,
        rank:          w.urank,
        prizeWon:      Number(w.winning_amount),
      })),
    };

  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
};

// ── Full refund helper (min entries not met) ──


export const handleFullRefund = async (conn, contestId, contest) => {
  const [entries] = await conn.query(
    `SELECT DISTINCT user_id, entry_fee
     FROM contest_entries
     WHERE contest_id = ? AND status = 'active'`,
    [contestId]
  );

  const [[companyLastRow]] = await conn.query(
    `SELECT closing_balance FROM wallet_transactions
     WHERE closing_balance IS NOT NULL ORDER BY id DESC LIMIT 1 FOR UPDATE`
  );
  let companyBalance = Number(companyLastRow?.closing_balance || 0);

  for (const entry of entries) {
    const refundAmt = Number(entry.entry_fee) || Number(contest.entry_fee);
    if (!refundAmt) continue;

    const [[wallet]] = await conn.query(
      `SELECT depositwallet, earnwallet, bonusamount FROM wallets WHERE user_id = ? FOR UPDATE`,
      [entry.user_id]
    );
    if (!wallet) continue;

    const totalBal = Number(wallet.depositwallet) + Number(wallet.earnwallet) + Number(wallet.bonusamount);
    const openBal  = parseFloat(totalBal.toFixed(2));
    const closeBal = parseFloat((totalBal + refundAmt).toFixed(2));

    const coOpen  = companyBalance;
    const coClose = Number((companyBalance - refundAmt).toFixed(2));
    companyBalance = coClose;

    // ── Deposit wallet credit ──
    await conn.query(
      `UPDATE wallets SET depositwallet = depositwallet + ? WHERE user_id = ?`,
      [refundAmt, entry.user_id]
    );

    // ── Transaction log ──
    await conn.query(
      `INSERT INTO wallet_transactions
       (user_id, wallettype, transtype, remark, amount,
        useropeningbalance, userclosingbalance,
        opening_balance, closing_balance)
       VALUES (?, 'deposit', 'credit', ?, ?, ?, ?, ?, ?)`,
      [
        entry.user_id,
        `Refund — Contest #${contestId} cancelled (min entries not met)`,
        refundAmt,
        openBal, closeBal,
        coOpen, coClose,
      ]
    );

    // ── Entry status → refunded ──
    await conn.query(
      `UPDATE contest_entries SET status = 'refunded'
       WHERE contest_id = ? AND user_id = ?`,
      [contestId, entry.user_id]
    );
  }

  // ── Contest → COMPLETED ──
  await conn.query(
    `UPDATE contest SET status = 'COMPLETED' WHERE id = ?`,
    [contestId]
  );
};




export const cancelContestService = async (contestId) => {
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [[contest]] = await conn.query(
      `SELECT id, status, entry_fee, min_entries, current_entries
       FROM contest WHERE id = ? FOR UPDATE`,
      [contestId]
    );
    if (!contest)
      throw Object.assign(new Error("Contest not found"), { statusCode: 404 });

    if (contest.status === "COMPLETED")
      throw Object.assign(new Error("Contest already completed"), { statusCode: 400 });

    if (contest.status === "INREVIEW")
      throw Object.assign(new Error("Contest in review — use announce instead"), { statusCode: 400 });

    // ── Full refund ──
    await handleFullRefund(conn, contestId, contest);

    await conn.commit();

    return {
      success: true,
      message: `Contest #${contestId} cancelled — all entries refunded`,
      contestId,
    };
  } catch (err) {
    if (conn) await conn.rollback();
    throw err;
  } finally {
    if (conn) conn.release();
  }
};

   