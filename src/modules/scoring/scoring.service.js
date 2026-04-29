import db from "../../config/db.js";
import { calculateTeamPoints, rankTeams,calculatePlayerPoints  } from "./scoring.engine.js";
import { getPrizeForRank, handleFullRefund } from '../contests/contest.service.js'

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


const saveScoreResults = async (contestId, rankedEntries, matchId) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // ── Player base points → player_match_stats లో save ──
  
    const playerPointsMap = {};
    for (const entry of rankedEntries) {
      for (const player of entry.players || []) {
     
        if (!playerPointsMap[player.playerId]) {
          playerPointsMap[player.playerId] = player.basePoints ?? 0;
        }
      }
    }

    // Bulk update — player_match_stats
    for (const [playerId, basePoints] of Object.entries(playerPointsMap)) {
      await conn.query(
        `UPDATE player_match_stats 
         SET fantasy_points = ?, is_finalized = 1
         WHERE match_id = ? AND player_id = ?`,
        [basePoints, matchId, playerId]
      );
    }

    // ── Contest entries — rank + winning save ──
    for (const entry of rankedEntries) {
      await conn.query(
        `UPDATE contest_entries
         SET urank = ?, winning_amount = ?, status = 'completed'
         WHERE id = ?`,
        [entry.rank, entry.prizeWon || 0, entry.entryId]
      );

      // user_team_players — final points (captain/VC applied)
      for (const player of entry.players || []) {
        await conn.query(
          `UPDATE user_team_players
           SET points = ?
           WHERE user_team_id = ? AND player_id = ?`,
          [player.finalPoints ?? 0, entry.userTeamId, player.playerId]
        );
      }
    }

    // await conn.query(
    //   `UPDATE contest SET status = 'COMPLETED' WHERE id = ?`,
    //   [contestId]
    // );

    await conn.query(
  `UPDATE contest SET status = 'INREVIEW' WHERE id = ?`,
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
            refund_winners, refund_start_rank,
            min_entries, current_entries, is_guaranteed
     FROM contest WHERE id = ?`,
    [contestId]
  );
  if (!contest) throw new Error(`Contest ${contestId} not found`);

  if (contest.status === "COMPLETED") {
    return { success: true, message: "Already scored", contestId, totalEntries: 0 };
  }

  // If contest is INREVIEW but ranks are already saved, skip re-score.
  const [[scoreState]] = await db.query(
    `SELECT
       COUNT(*) AS total_entries,
       SUM(CASE WHEN urank IS NOT NULL THEN 1 ELSE 0 END) AS ranked_entries
     FROM contest_entries
     WHERE contest_id = ?`,
    [contestId]
  );
  const rankedEntriesCount = Number(scoreState?.ranked_entries || 0);
  if (contest.status === "INREVIEW" && rankedEntriesCount > 0) {
    return { success: true, message: "Already scored", contestId, totalEntries: 0 };
  }

  // ── Min entries check — non-guaranteed contests only ──
  const minEntries     = Number(contest.min_entries     || 0);
  const currentEntries = Number(contest.current_entries || 0);
  if (!contest.is_guaranteed && minEntries > 0 && currentEntries < minEntries) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await handleFullRefund(conn, contestId, contest);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    return {
      success:   true,
      message:   `Contest #${contestId} cancelled — min entries not met (${currentEntries}/${minEntries}), all entries refunded`,
      contestId,
      refunded:  true,
    };
  }

  // ── 1. Fetch entries ──
  const entries = await fetchContestEntries(contestId);
  if (!entries.length) throw new Error("No entries found for this contest");

  // ── 2. All unique player IDs ──
  const allPlayerIds = [...new Set(
    entries.flatMap(e => e.players.map(p => p.playerId))
  )];

  // ── 3. Fetch stats ──
  const allStats = await fetchPlayerStats(matchId, allPlayerIds);
  const statsMap = {};
  allStats.forEach(s => { statsMap[s.playerId] = s; });

  // ── ✅ NEW: Match-level max base points calculate  ──


  
  let allMatchMaxPoints = 0;
  for (const stat of allStats) {
    const result = calculatePlayerPoints(stat);
    if (result.basePoints > allMatchMaxPoints) {
      allMatchMaxPoints = result.basePoints;
    }
  }

  // ── 4. Score each team — allMatchMaxPoints pass  ──
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
      entry.viceCaptainId,
      allMatchMaxPoints  
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
  await saveScoreResults(contestId, ranked,matchId );

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


// scoring.service.js లో — new function add 
export const updateLiveScores = async (matchId) => {
 
  const [contests] = await db.query(
    `SELECT id FROM contest WHERE match_id = ? AND status = 'LIVE'`,
    [matchId]
  );
  if (!contests.length) return;

  const contestIds = contests.map(c => c.id);
  const [entries] = await db.query(
    `SELECT ce.contest_id, ce.user_id, ce.user_team_id,
            ut.team_name, u.name, u.nickname, u.image
     FROM contest_entries ce
     JOIN user_teams ut ON ut.id = ce.user_team_id
     JOIN users u ON u.id = ce.user_id
     WHERE ce.contest_id IN (?)`,
    [contestIds]
  );

  // ── 3. Unique team ids ──
  const teamIds = [...new Set(entries.map(e => e.user_team_id))];

  // ── 4. Player stats fetch (live — partial stats) ──
  const allPlayerIds = [];
  const [teamPlayerRows] = await db.query(
    `SELECT user_team_id, player_id, is_captain, is_vice_captain
     FROM user_team_players WHERE user_team_id IN (?)`,
    [teamIds]
  );

  teamPlayerRows.forEach(r => allPlayerIds.push(r.player_id));
  const uniquePlayerIds = [...new Set(allPlayerIds)];

  const allStats = await fetchPlayerStats(matchId, uniquePlayerIds);
  const statsMap = {};
  allStats.forEach(s => { statsMap[s.playerId] = s; });

  // ── 5. Team points calculate ──
  const teamPlayersMap = {};
  teamPlayerRows.forEach(r => {
    if (!teamPlayersMap[r.user_team_id]) teamPlayersMap[r.user_team_id] = [];
    teamPlayersMap[r.user_team_id].push(r);
  });

  const teamPointsMap = {};
  for (const teamId of teamIds) {
    const players = teamPlayersMap[teamId] || [];
    const captainId    = players.find(p => p.is_captain)?.player_id || null;
    const viceCaptainId = players.find(p => p.is_vice_captain)?.player_id || null;
    const statsList = players.map(p => statsMap[p.player_id]).filter(Boolean);
    if (!statsList.length) { teamPointsMap[teamId] = 0; continue; }
    const result = calculateTeamPoints(statsList, captainId, viceCaptainId);
    teamPointsMap[teamId] = result.teamTotal;
  }

  // ── 6. Contest wise — rank calculate + Redis store ──
  for (const contest of contests) {
    const contestEntries = entries.filter(e => e.contest_id === contest.id);

    // Points assign + sort
    const ranked = contestEntries
      .map(e => ({
        user_id:      e.user_id,
        user_team_id: e.user_team_id,
        team_name:    e.team_name    || null,
        username:     e.nickname     || e.name,
        profile_image: e.image       || null,
        points:       teamPointsMap[e.user_team_id] || 0,
      }))
      .sort((a, b) => b.points - a.points);

    // DENSE_RANK
    ranked.forEach((entry, i) => {
      if (i === 0) entry.rank = 1;
      else if (entry.points === ranked[i - 1].points) entry.rank = ranked[i - 1].rank;
      else entry.rank = i + 1;
    });

    // Redis in store — 5 minutes expiry
    await redis.set(
      lbKey(contest.id),
      JSON.stringify(ranked),
      'EX', 300  
    );
  }
};
