
import cron from "node-cron";
import db    from "../../config/db.js";
import redis from "../../config/redis.js";
import {
  syncPlayingXIService,
  syncPlayerPointsService,
} from "./sportmonks.service.js";
import { scoreContestService } from "../scoring/scoring.service.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatDateTime = (date) => {
  return date.toISOString().slice(0, 19).replace("T", " ");
};

// ─────────────────────────────────────────────────────────────────────────────
// CACHE KEY
// ─────────────────────────────────────────────────────────────────────────────
export const leaderboardCacheKey = (contestId) => `LB:${contestId}`;
const CACHE_TTL = 120; // 2 minutes

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — one contest leaderboard compute + cache
// ─────────────────────────────────────────────────────────────────────────────

export const computeAndCacheLeaderboard = async (contestId, matchId) => {
  const [entries] = await db.query(
    `SELECT
       ce.user_id,
       ce.user_team_id,
       u.name,
       u.nickname,
       u.image,
       ut.team_name
     FROM contest_entries ce
     JOIN users u ON u.id = ce.user_id
     LEFT JOIN user_teams ut ON ut.id = ce.user_team_id
     WHERE ce.contest_id = ?`,
    [contestId]
  );

  if (!entries.length) return [];

  // ── All team IDs ──
  const teamIds = [...new Set(entries.map(e => e.user_team_id).filter(Boolean))];

  // ── Team players + stats fetch ──
  const [playerRows] = await db.query(
    `SELECT
       utp.user_team_id,
       utp.player_id,
       utp.is_captain,
       utp.is_vice_captain,
       utp.is_substitude,
       COALESCE(pms.fantasy_points, 0) AS base_points
     FROM user_team_players utp
     LEFT JOIN player_match_stats pms
       ON pms.player_id = utp.player_id
      AND pms.match_id  = ?
     WHERE utp.user_team_id IN (?)`,
    [matchId, teamIds]
  );

  // ── Team players group ──
  const teamPlayersMap = {};
  playerRows.forEach(r => {
    if (!teamPlayersMap[r.user_team_id]) teamPlayersMap[r.user_team_id] = [];
    teamPlayersMap[r.user_team_id].push(r);
  });

  // ── Points calculate with HS Bonus ──
  const teamPointsMap = {};
  for (const teamId of teamIds) {
    const players = teamPlayersMap[teamId] || [];
    if (!players.length) { teamPointsMap[teamId] = 0; continue; }

    // Step 1: base points
    const withBase = players.map(p => ({
      ...p,
      basePoints: parseFloat(p.base_points) || 0,
    }));

    // Step 2: HS Bonus — max base points player కి bonus
    const maxBase = Math.max(...withBase.map(p => p.basePoints));
    const withHS = withBase.map(p => {
      if (p.basePoints !== maxBase || maxBase <= 0) return p;
      const hsBonus = p.is_substitude ? 8 : 4;
      return { ...p, basePoints: p.basePoints + hsBonus };
    });

    // Step 3: Captain/VC multiplier apply
    const total = withHS.reduce((sum, p) => {
      const multiplier = p.is_captain ? 2 : p.is_vice_captain ? 1.5 : 1;
      return sum + parseFloat((p.basePoints * multiplier).toFixed(2));
    }, 0);

    teamPointsMap[teamId] = parseFloat(total.toFixed(2));
  }

  // ── DENSE_RANK ──
  const ranked = entries
    .map(e => ({
      user_id:       e.user_id,
      user_team_id:  e.user_team_id,
      team_name:     e.team_name    || null,
      username:      e.nickname     || e.name || `User${e.user_id}`,
      profile_image: e.image        || null,
      points:        teamPointsMap[e.user_team_id] || 0,
    }))
    .sort((a, b) => b.points - a.points);

  let rank = 1, lastPts = null, skip = 0;
  ranked.forEach((entry, i) => {
    const pts = entry.points;
    if (lastPts === null)       { lastPts = pts; skip = 1; }
    else if (pts === lastPts)   { skip++; }
    else                        { rank += skip; skip = 1; lastPts = pts; }
    entry.rank = rank;
  });

  // ── Redis store ──
  await redis.set(
    leaderboardCacheKey(contestId),
    ranked,
    { ex: CACHE_TTL }
  );

  return ranked;
};

// ─────────────────────────────────────────────────────────────────────────────
// JOB 1 — LINEUP SYNC — every 5 mins
// ─────────────────────────────────────────────────────────────────────────────
const syncLineups = async () => {
  console.log("⏰ [CRON] Lineup sync started:", new Date().toISOString());
  try {
    const now             = new Date();
    const ninetyMinsLater = new Date(now.getTime() + 90 * 60 * 1000);

    const [matches] = await db.query(
      `SELECT id, provider_match_id, start_time, lineup_status, status
       FROM matches
       WHERE is_active = 1
         AND lineup_status != 'confirmed'
         AND (
           (status = 'UPCOMING' AND start_time <= ?)
           OR status = 'LIVE'
         )
       ORDER BY start_time ASC`,
      [formatDateTime(ninetyMinsLater)]
    );

    if (!matches.length) {
      console.log("✅ [CRON] No matches needing lineup sync");
      return;
    }

    console.log(`📋 [CRON] Lineup check for ${matches.length} match(es)`);

    for (const match of matches) {
      try {
        const result = await syncPlayingXIService(match.provider_match_id);
        if (result.reason) {
          console.log(`⏳ [CRON] Match ${match.provider_match_id} — ${result.reason}`);
        } else {
          console.log(`✅ [CRON] Match ${match.provider_match_id} — ${result.count} players confirmed`);
        }
        await sleep(1000);
      } catch (err) {
        console.error(`❌ [CRON] Lineup failed for ${match.provider_match_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ [CRON] syncLineups failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// JOB 2 — MATCH STATUS — every 5 mins lll
// ─────────────────────────────────────────────────────────────────────────────
const syncMatchStatuses = async () => {
  console.log("⏰ [CRON] Status sync started:", new Date().toISOString());
  try {
    const [toLive] = await db.query(
      `UPDATE matches SET status = 'LIVE'
       WHERE is_active = 1 AND status = 'UPCOMING' AND start_time <= NOW()`
    );
    const [toResult] = await db.query(
      `UPDATE matches SET status = 'RESULT'
       WHERE is_active = 1
         AND status IN ('UPCOMING', 'LIVE')
         AND start_time <= DATE_SUB(NOW(), INTERVAL 150 MINUTE)`
    );
    console.log(
      `✅ [CRON] UPCOMING→LIVE: ${toLive.affectedRows} | LIVE→RESULT: ${toResult.affectedRows}`
    );
  } catch (err) {
    console.error("❌ [CRON] syncMatchStatuses failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// JOB 3 — POINTS + LEADERBOARD — every 2 mins
// ✅ Points sync ముందు, leaderboard cache తర్వాత — ORDER GUARANTEED
// ─────────────────────────────────────────────────────────────────────────────
const syncPointsAndCacheLeaderboard = async () => {
  console.log("⏰ [CRON] Points + Leaderboard sync started:", new Date().toISOString());
  try {
    // ── Step 1: LIVE + RESULT matches కి points sync ──
    const [matches] = await db.query(
      `SELECT id, provider_match_id, status
       FROM matches
       WHERE is_active = 1
         AND status IN ('LIVE', 'RESULT')
         AND start_time >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
       ORDER BY start_time DESC`
    );

    if (!matches.length) {
      console.log("✅ [CRON] No matches needing sync");
      return;
    }

    // Points sync — parallel
    const pointsResults = await Promise.allSettled(
      matches.map(m => syncPlayerPointsService(m.provider_match_id))
    );

    pointsResults.forEach((r, i) => {
      const m = matches[i];
      if (r.status === "fulfilled") {
        console.log(`✅ [CRON] Points synced: Match ${m.provider_match_id} [${m.status}]`);
      } else {
        console.error(`❌ [CRON] Points failed: Match ${m.provider_match_id}:`, r.reason?.message);
      }
    });

    // ── Step 2: LIVE matches కి leaderboard cache ──
    // Points sync అయిన తర్వాతే run అవుతుంది ✅
    const liveMatchIds = matches
      .filter(m => m.status === 'LIVE')
      .map(m => m.id);

    if (!liveMatchIds.length) {
      console.log("✅ [CRON] No LIVE matches for leaderboard cache");
      return;
    }

    const [liveContests] = await db.query(
      `SELECT c.id AS contest_id, c.match_id
       FROM contest c
       WHERE c.match_id IN (?)
         AND c.status != 'COMPLETED'`,
      [liveMatchIds]
    );

    if (!liveContests.length) {
      console.log("✅ [CRON] No live contests to cache");
      return;
    }

    await Promise.allSettled(
      liveContests.map(c => computeAndCacheLeaderboard(c.contest_id, c.match_id))
    );

    console.log(`✅ [CRON] Leaderboard cached for ${liveContests.length} contest(s)`);

  } catch (err) {
    console.error("❌ [CRON] syncPointsAndCacheLeaderboard failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// JOB 4 — CONTEST SCORING — every 10 mins (RESULT only)
// ─────────────────────────────────────────────────────────────────────────────
const scoreCompletedMatches = async () => {
  console.log("⏰ [CRON] Contest scoring started:", new Date().toISOString());
  try {
    const [contests] = await db.query(
      `SELECT c.id AS contestId, c.match_id AS matchId
       FROM contest c
       JOIN matches m ON m.id = c.match_id
       WHERE m.is_active = 1
         AND m.status = 'RESULT'
         AND c.status NOT IN ('COMPLETED')
         AND m.start_time >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
       ORDER BY c.id ASC`
    );    

    if (!contests.length) {
      console.log("✅ [CRON] No contests pending scoring");
      return;
    }

    console.log(`🏆 [CRON] Scoring ${contests.length} contest(s)...`);

    for (const contest of contests) {
      try {
        const result = await scoreContestService(contest.contestId, contest.matchId);
        console.log(
          `✅ [CRON] Contest ${contest.contestId} scored — ${result.totalEntries} entries`
        );
        await sleep(500);
      } catch (err) {
        console.error(`❌ [CRON] Scoring failed for contest ${contest.contestId}:`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ [CRON] scoreCompletedMatches failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// JOB 5 — CLEANUP — daily 2 AM UTC
// ─────────────────────────────────────────────────────────────────────────────
const cleanupOldInactiveMatches = async () => {
  console.log("🧹 [CRON] Cleanup started:", new Date().toISOString());
  try {
    const [result] = await db.query(
      `DELETE FROM matches
       WHERE is_active = 0
         AND start_time <= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );
    console.log(`✅ [CRON] Cleanup done — ${result.affectedRows} matches deleted`);
  } catch (err) {
    console.error("❌ [CRON] Cleanup failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTEST STATUS SYNC — match status బట్టి contest status update
// ─────────────────────────────────────────────────────────────────────────────
const syncContestStatuses = async () => {
  console.log("⏰ [CRON] Contest status sync started:", new Date().toISOString());
  try {

    // ── UPCOMING → LIVE (match LIVE అయినప్పుడు) ──
    const [toLive] = await db.query(
      `UPDATE contest c
       JOIN matches m ON m.id = c.match_id
       SET c.status = 'LIVE'
       WHERE c.status = 'UPCOMING'
         AND m.status = 'LIVE'
         AND m.is_active = 1`
    );

    // ── LIVE → INREVIEW (match RESULT అయినప్పుడు) ──
    const [toReview] = await db.query(
      `UPDATE contest c
       JOIN matches m ON m.id = c.match_id
       SET c.status = 'INREVIEW'
       WHERE c.status = 'LIVE'
         AND m.status = 'RESULT'
         AND m.is_active = 1`
    );

    console.log(
      `✅ [CRON] Contest UPCOMING→LIVE: ${toLive.affectedRows} | LIVE→INREVIEW: ${toReview.affectedRows}`
    );

  } catch (err) {
    console.error("❌ [CRON] syncContestStatuses failed:", err.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER ALL CRON JOBS
// ─────────────────────────────────────────────────────────────────────────────
export const startCronJobs = () => {

  // Lineup — every 5 mins
  cron.schedule("*/5 * * * *",  syncLineups,                    { scheduled: true, timezone: "UTC" });

  // Status — every 5 mins
  cron.schedule("*/5 * * * *",  syncMatchStatuses,              { scheduled: true, timezone: "UTC" });

   // ✅ Contest Status — every 5 mins 
  cron.schedule("*/5 * * * *",  syncContestStatuses,            { scheduled: true, timezone: "UTC" })
 
  // Points + Leaderboard — every 2 mins (combined, order guaranteed)
  cron.schedule("*/2 * * * *",  syncPointsAndCacheLeaderboard,  { scheduled: true, timezone: "UTC" });

  // Scoring — every 10 mins
  cron.schedule("*/10 * * * *", scoreCompletedMatches,          { scheduled: true, timezone: "UTC" });

  // Cleanup — daily 2 AM
  cron.schedule("0 2 * * *",    cleanupOldInactiveMatches,      { scheduled: true, timezone: "UTC" });

  console.log("🚀 [CRON] All jobs registered");
};