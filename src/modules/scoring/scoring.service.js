import db from "../../config/db.js";
import { calculateTeamPoints, rankTeams } from "./scoring.engine.js";
import { getPrizeForRank } from '../contests/contest.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// FETCH PLAYER STATS FROM DB
// Fix: all columns read from player_match_stats (not hardcoded 0)
// ─────────────────────────────────────────────────────────────────────────────

export const fetchPlayerStats = async (matchId, playerIds) => {
  if (!playerIds?.length) return [];

  const [rows] = await db.query(
    `SELECT
       pms.player_id          AS playerId,
       p.position,
       pms.goals,
       pms.assists,
       pms.yellow_cards       AS yellowCards,
       pms.red_cards          AS redCards,
       pms.started,
       pms.sub_appearance     AS subAppearance,
       pms.played_full_match  AS playedFullMatch,
       pms.minutes_played     AS minutesPlayed,
       pms.shots_on_target    AS shotsOnTarget,
       pms.key_passes         AS keyPasses,
       pms.penalties_earned   AS penaltiesEarned,
       pms.goals_conceded     AS goalsConceded,
       pms.saves,
       pms.penalty_saves      AS penaltySaves,
       pms.tackles_won        AS tacklesWon,
       pms.interceptions,
       pms.blocked_shots      AS blockedShots,
       pms.own_goals          AS ownGoals,
       pms.penalties_missed   AS penaltiesMissed
     FROM player_match_stats pms
     JOIN players p ON p.id = pms.player_id
     WHERE pms.match_id  = ?
       AND pms.player_id IN (?)`,
    [matchId, playerIds]
  );

  return rows;
};

// ─────────────────────────────────────────────────────────────────────────────
// FETCH CONTEST ENTRIES WITH TEAM PLAYERS
// ─────────────────────────────────────────────────────────────────────────────

const fetchContestEntries = async (contestId) => {
  const [entries] = await db.query(
    `SELECT
       ce.id           AS entryId,
       ce.user_id      AS userId,
       ce.user_team_id AS userTeamId
     FROM contest_entries ce
     WHERE ce.contest_id = ?`,
    [contestId]
  );
  if (!entries.length) return [];

  const teamIds = [...new Set(entries.map(e => e.userTeamId))];

  const [teamPlayers] = await db.query(
    `SELECT
       utp.user_team_id    AS userTeamId,
       utp.player_id       AS playerId,
       utp.is_captain      AS isCaptain,
       utp.is_vice_captain AS isViceCaptain
     FROM user_team_players utp
     WHERE utp.user_team_id IN (?)`,
    [teamIds]
  );

  const teamPlayersMap = {};
  teamPlayers.forEach(tp => {
    if (!teamPlayersMap[tp.userTeamId]) teamPlayersMap[tp.userTeamId] = [];
    teamPlayersMap[tp.userTeamId].push(tp);
  });

  return entries.map(e => ({
    ...e,
    players:       teamPlayersMap[e.userTeamId] || [],
    captainId:     (teamPlayersMap[e.userTeamId] || []).find(p => p.isCaptain)?.playerId     || null,
    viceCaptainId: (teamPlayersMap[e.userTeamId] || []).find(p => p.isViceCaptain)?.playerId || null,
  }));
};

// ─────────────────────────────────────────────────────────────────────────────
// SAVE SCORE RESULTS TO DB
// Updates contest_entries.urank + winning_amount
// Updates user_team_players.points (per player final points)
// Marks contest COMPLETED
// ─────────────────────────────────────────────────────────────────────────────

const saveScoreResults = async (contestId, rankedEntries) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const entry of rankedEntries) {
      await conn.query(
        `UPDATE contest_entries
         SET urank = ?, winning_amount = ?, status = 'completed'
         WHERE id = ?`,
        [entry.rank, entry.prizeWon || 0, entry.entryId]
      );

      for (const player of entry.players || []) {
        await conn.query(
          `UPDATE user_team_players
           SET points = ?
           WHERE user_team_id = ? AND player_id = ?`,
          [player.finalPoints ?? 0, entry.userTeamId, player.playerId]
        );
      }
    }

    await conn.query(
      `UPDATE contest SET status = 'COMPLETED' WHERE id = ?`,
      [contestId]
    );

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SCORE CONTEST SERVICE
// Runs ONCE after match RESULT
// 1. Score all teams (engine handles captain/VC/highest scorer/skill bonus)
// 2. DENSE_RANK
// 3. Tie-safe prize split using getPrizeForRank
// 4. Save to DB
// ─────────────────────────────────────────────────────────────────────────────

export const scoreContestService = async (contestId, matchId) => {
  if (!contestId) throw new Error("contestId is required");
  if (!matchId)   throw new Error("matchId is required");

  // ── Already completed? ──
  const [[contest]] = await db.query(
    `SELECT id, status, entry_fee, prize_distribution,
            refund_winners, refund_start_rank
     FROM contest WHERE id = ?`,
    [contestId]
  );
  if (!contest) throw new Error(`Contest ${contestId} not found`);
  if (contest.status === "COMPLETED") {
    return { success: true, message: "Already scored", contestId, totalEntries: 0 };
  }

  // ── 1. Fetch entries ──
  const entries = await fetchContestEntries(contestId);
  if (!entries.length) throw new Error("No entries found for this contest");

  // ── 2. All unique player IDs ──
  const allPlayerIds = [...new Set(
    entries.flatMap(e => e.players.map(p => p.playerId))
  )];

  // ── 3. Fetch stats from player_match_stats ──
  const allStats = await fetchPlayerStats(matchId, allPlayerIds);
  const statsMap = {};
  allStats.forEach(s => { statsMap[s.playerId] = s; });

  // ── 4. Score each team ──
  const scoredEntries = entries.map(entry => {
    const playerStatsList = entry.players
      .map(p => statsMap[p.playerId])
      .filter(Boolean);

    if (!playerStatsList.length) {
      return {
        entryId:    entry.entryId,
        userId:     entry.userId,
        userTeamId: entry.userTeamId,
        teamTotal:  0,
        players:    [],
      };
    }

    const result = calculateTeamPoints(
      playerStatsList,
      entry.captainId,
      entry.viceCaptainId
    );

    return {
      entryId:    entry.entryId,
      userId:     entry.userId,
      userTeamId: entry.userTeamId,
      teamTotal:  result.teamTotal,
      players:    result.players,
    };
  });

  // ── 5. Rank teams (DENSE_RANK — same points = same rank) ──
  const ranked = rankTeams(scoredEntries);

  // ── 6. Tie-safe prize distribution using getPrizeForRank ──
  // Group by rank → aggregate prizes for tied range → split equally
  const rankGroups = {};
  for (const entry of ranked) {
    if (!rankGroups[entry.rank]) rankGroups[entry.rank] = [];
    rankGroups[entry.rank].push(entry);
  }

  for (const [rankStr, group] of Object.entries(rankGroups)) {
    const rank  = parseInt(rankStr);
    const count = group.length;

    let totalPrize = 0;
    for (let r = rank; r < rank + count; r++) {
      totalPrize += getPrizeForRank(
        r,
        contest.prize_distribution,
        contest.entry_fee,
        contest.refund_winners,
        contest.refund_start_rank
      );
    }

    const splitPrize = parseFloat((totalPrize / count).toFixed(2));
    group.forEach(entry => { entry.prizeWon = splitPrize; });
  }

  // ── 7. Save results ──
  await saveScoreResults(contestId, ranked);

  return {
    success:      true,
    contestId,
    totalEntries: ranked.length,
    results:      ranked.map(e => ({
      entryId:    e.entryId,
      userId:     e.userId,
      userTeamId: e.userTeamId,
      rank:       e.rank,
      teamTotal:  e.teamTotal,
      prizeWon:   e.prizeWon || 0,
    })),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET SCORE BREAKDOWN (single team in a contest)
// ─────────────────────────────────────────────────────────────────────────────

export const getScoreBreakdownService = async (contestId, userTeamId, matchId) => {
  if (!contestId || !userTeamId || !matchId)
    throw new Error("contestId, userTeamId, matchId are required");

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

  const playerIds      = teamPlayers.map(p => p.playerId);
  const allStats       = await fetchPlayerStats(matchId, playerIds);
  const statsMap       = {};
  allStats.forEach(s => { statsMap[s.playerId] = s; });

  const captainId      = teamPlayers.find(p => p.isCaptain)?.playerId     || null;
  const viceCaptainId  = teamPlayers.find(p => p.isViceCaptain)?.playerId  || null;

  const playerStatsList = teamPlayers
    .map(p => statsMap[p.playerId])
    .filter(Boolean);

  const result = calculateTeamPoints(playerStatsList, captainId, viceCaptainId);

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