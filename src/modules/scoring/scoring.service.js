/**
 * PICK2WIN – Scoring Service
 * DB interaction: fetch stats → score → save results
 */

import db from "../../config/db.js";
import {  calculateTeamPoints,  rankTeams,  distributePrizes,
} from "./scoring.engine.js";


export const fetchPlayerStats = async (matchId, playerIds) => {
  if (!playerIds.length) return [];

  const [rows] = await db.query(
    `SELECT
       pms.player_id   AS playerId,
       p.position,
       pms.goals,
       pms.assists,
       pms.yellow_cards  AS yellowCards,
       pms.red_cards     AS redCards,
       -- All missing stats default to 0 in the engine via (stats.x || 0)
       0  AS started,
       0  AS subAppearance,
       0  AS playedFullMatch,
       0  AS minutesPlayed,
       0  AS shotsOnTarget,
       0  AS keyPasses,
       0  AS penaltiesEarned,
       0  AS goalsConceded,
       0  AS saves,
       0  AS penaltySaves,
       0  AS tacklesWon,
       0  AS interceptions,
       0  AS blockedShots,
       0  AS ownGoals,
       0  AS penaltiesMissed
     FROM player_match_stats pms
     JOIN players p ON p.id = pms.player_id
     WHERE pms.match_id = ?
     AND pms.player_id IN (?)`,
    [matchId, playerIds]
  );

  return rows;
};
  
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

  const teamIds = [...new Set(entries.map((e) => e.userTeamId))];

  const [teamPlayers] = await db.query(
    `SELECT
       utp.user_team_id  AS userTeamId,
       utp.player_id     AS playerId,
       utp.is_captain    AS isCaptain,
       utp.is_vice_captain AS isViceCaptain
     FROM user_team_players utp
     WHERE utp.user_team_id IN (?)`,
    [teamIds]
  );

  // Group players by team
  const teamPlayersMap = {};
  teamPlayers.forEach((tp) => {
    if (!teamPlayersMap[tp.userTeamId]) teamPlayersMap[tp.userTeamId] = [];
    teamPlayersMap[tp.userTeamId].push(tp);
  });

  return entries.map((e) => ({
    ...e,
    players: teamPlayersMap[e.userTeamId] || [],
    captainId:    (teamPlayersMap[e.userTeamId] || []).find((p) => p.isCaptain)?.playerId    || null,
    viceCaptainId:(teamPlayersMap[e.userTeamId] || []).find((p) => p.isViceCaptain)?.playerId || null,
  }));
};


// ─────────────────────────────────────────────
// HELPER: Fetch prize pool for contest
// ─────────────────────────────────────────────
const fetchPrizePool = async (contestId) => {
  const [[contest]] = await db.query(
    `SELECT prize_distribution FROM contest WHERE id = ?`,
    [contestId]
  );

  if (!contest) throw new Error("Contest not found");

  let tiers = [];
  try {
    tiers = typeof contest.prize_distribution === "string"
      ? JSON.parse(contest.prize_distribution)
      : contest.prize_distribution || [];
  } catch {
    tiers = [];
  }

  // Convert tier array → { rank: amount } map
  const prizePool = {};
  tiers.forEach((tier) => {
    for (let r = tier.rank_from; r <= tier.rank_to; r++) {
      prizePool[r] = tier.amount || 0;
    }
  });

  return prizePool;
};


// ─────────────────────────────────────────────
// SCORE CONTEST SERVICE
// Score all teams in a contest, rank, distribute prizes
// ─────────────────────────────────────────────
export const scoreContestService = async (contestId, matchId) => {
  if (!contestId) throw new Error("contestId is required");
  if (!matchId)   throw new Error("matchId is required");

  // 1. Fetch all entries
  const entries = await fetchContestEntries(contestId);
  if (!entries.length) throw new Error("No entries found for this contest");

  // 2. Collect all unique playerIds
  const allPlayerIds = [...new Set(
    entries.flatMap((e) => e.players.map((p) => p.playerId))
  )];

  // 3. Fetch player match stats from DB
  const allStats = await fetchPlayerStats(matchId, allPlayerIds);
  const statsMap = {};
  allStats.forEach((s) => { statsMap[s.playerId] = s; });

  // 4. Score each entry (team)
  const scoredEntries = entries.map((entry) => {
    const playerStatsList = entry.players
      .map((p) => statsMap[p.playerId])
      .filter(Boolean); // skip players with no stats

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

  // 5. Rank teams
  const ranked = rankTeams(scoredEntries);

  // 6. Prize distribution
  const prizePool    = await fetchPrizePool(contestId);
  const withPrizes   = distributePrizes(ranked, prizePool);

  // 7. Save results to DB
  await saveScoreResults(contestId, withPrizes);

  return {
    success:      true,
    contestId,
    totalEntries: withPrizes.length,
    results:      withPrizes.map((e) => ({
      entryId:       e.entryId,
      userId:        e.userId,
      userTeamId:    e.userTeamId,
      rank:          e.rank,
      teamTotal:     e.teamTotal,
      prizeWon:      e.prizeWon,
    })),
  };
};


// ─────────────────────────────────────────────
// SAVE SCORE RESULTS TO DB
// Updates contest_entries with rank + winning_amount
// Saves per-player points to user_team_players
// ─────────────────────────────────────────────
const saveScoreResults = async (contestId, rankedEntries) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    for (const entry of rankedEntries) {
      // Update contest_entry: rank + winning_amount
      await conn.query(
        `UPDATE contest_entries
         SET urank = ?, winning_amount = ?, status = 'completed'
         WHERE id = ?`,
        [entry.rank, entry.prizeWon || 0, entry.entryId]
      );

      // Update per-player fantasy points in user_team_players
      for (const player of entry.players || []) {
        await conn.query(
          `UPDATE user_team_players
           SET points = ?
           WHERE user_team_id = ? AND player_id = ?`,
          [player.finalPoints, entry.userTeamId, player.playerId]
        );
      }
    }

    // Mark contest as completed
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