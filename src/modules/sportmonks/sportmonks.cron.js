// import cron from "node-cron";
// import db    from "../../config/db.js";
// import redis from "../../config/redis.js";
// import {
//   syncPlayingXIService,
//   syncPlayerPointsService,
// } from "./sportmonks.service.js";
// import { scoreContestService } from "../scoring/scoring.service.js";
// import { updateLiveScores } from "../scoring/scoring.service.js"



// const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// const formatDateTime = (date) => {
//   return date.toISOString().slice(0, 19).replace("T", " ");
// };

// // ─────────────────────────────────────────────────────────────────────────────
// // LEADERBOARD CACHE KEY HELPER
// // ─────────────────────────────────────────────────────────────────────────────

// export const leaderboardCacheKey = (contestId) => `LB:${contestId}`;
// const CACHE_TTL = 60 * 2; // 2 min TTL (reduced from 6 to match 2-min cron)

// // ─────────────────────────────────────────────────────────────────────────────
// // COMPUTE & CACHE — one contest
// // ─────────────────────────────────────────────────────────────────────────────

// export const computeAndCacheLeaderboard = async (contestId, matchId) => {
//   const [entries] = await db.query(
//     `SELECT
//        ce.user_id,
//        ce.user_team_id,
//        ce.urank,
//        ce.winning_amount,
//        u.name,
//        u.nickname,
//        u.image,
//        ut.team_name,
//        COALESCE(
//          (SELECT SUM(
//             CASE
//               WHEN utp.is_captain      = 1 THEN pms.fantasy_points * 2
//               WHEN utp.is_vice_captain = 1 THEN pms.fantasy_points * 1.5
//               ELSE pms.fantasy_points
//             END
//           )
//           FROM user_team_players utp
//           JOIN player_match_stats pms
//             ON pms.player_id = utp.player_id
//            AND pms.match_id  = ?
//           WHERE utp.user_team_id = ce.user_team_id
//          ), 0
//        ) AS total_points
//      FROM contest_entries ce
//      JOIN users      u  ON u.id  = ce.user_id
//      LEFT JOIN user_teams ut ON ut.id = ce.user_team_id
//      WHERE ce.contest_id = ?
//      ORDER BY total_points DESC`,
//     [matchId, contestId]
//   );

//   // DENSE_RANK in JS
//   let rank    = 1;
//   let lastPts = null;
//   let skip    = 0;

//   const ranked = entries.map(e => {
//     const pts = parseFloat(e.total_points) || 0;
//     if (lastPts === null) {
//       lastPts = pts; skip = 1;
//     } else if (pts === lastPts) {
//       skip++;
//     } else {
//       rank   += skip;
//       skip    = 1;
//       lastPts = pts;
//     }
//     return {
//       rank,
//       user_id:        e.user_id,
//       username:       e.nickname  || e.name || `User${e.user_id}`,
//       profile_image:  e.image     || null,
//       team_name:      e.team_name || null,
//       user_team_id:   e.user_team_id,
//       points:         pts,
//       urank:          e.urank          || null,
//       winning_amount: Number(e.winning_amount) || 0,
//     };
//   });

//   await redis.set(
//     leaderboardCacheKey(contestId),
//     JSON.stringify(ranked),
//     { ex: CACHE_TTL }
//   );

//   return ranked;
// };

// /* ══════════════════════════════════════════
//    JOB 1 — LINEUP SYNC — every 5 mins
//    90-min window before match start
// ══════════════════════════════════════════ */
// const syncLineups = async () => {
//   console.log("⏰ [CRON] Lineup sync started:", new Date().toISOString());
//   try {
//     const now            = new Date();
//     const ninetyMinsLater = new Date(now.getTime() + 90 * 60 * 1000); // ✅ 90 min window

//     const [matches] = await db.query(
//       `SELECT id, provider_match_id, start_time, lineup_status, status
//        FROM matches
//        WHERE is_active = 1
//          AND lineup_status != 'confirmed'
//          AND (
//            (status = 'UPCOMING' AND start_time <= ?)
//            OR status = 'LIVE'
//          )
//        ORDER BY start_time ASC`,
//       [formatDateTime(ninetyMinsLater)]   // ✅ single param — covers past-stuck + near-future + live
//     );

//     if (!matches.length) {
//       console.log("✅ [CRON] No matches needing lineup sync");
//       return;
//     }

//     console.log(`📋 [CRON] Checking lineup for ${matches.length} match(es)...`);

//     for (const match of matches) {
//       try {
//         const result = await syncPlayingXIService(match.provider_match_id);
//         if (result.reason) {
//           console.log(`⏳ [CRON] Match ${match.provider_match_id} — ${result.reason} (will retry)`);
//         } else {
//           console.log(`✅ [CRON] Match ${match.provider_match_id} — lineup confirmed: ${result.count} players`);
//         }
//         await sleep(1000);
//       } catch (err) {
//         console.error(`❌ [CRON] Lineup sync failed for match ${match.provider_match_id}:`, err.message);
//       }
//     }
//   } catch (err) {
//     console.error("❌ [CRON] syncLineups job failed:", err.message);
//   }
// };

// /* ══════════════════════════════════════════
//    JOB 2 — MATCH STATUS SYNC — every 5 mins
// ══════════════════════════════════════════ */
// const syncMatchStatuses = async () => {
//   console.log("⏰ [CRON] Match status sync started:", new Date().toISOString());
//   try {
//     const [upcomingToLive] = await db.query(
//       `UPDATE matches SET status = 'LIVE'
//        WHERE is_active = 1 AND status = 'UPCOMING' AND start_time <= NOW()`
//     );
//     const [liveToResult] = await db.query(
//       `UPDATE matches SET status = 'RESULT'
//        WHERE is_active = 1
//          AND status IN ('UPCOMING', 'LIVE')
//          AND start_time <= DATE_SUB(NOW(), INTERVAL 150 MINUTE)`
//     );

//     console.log(
//       `✅ [CRON] Statuses updated | UPCOMING→LIVE: ${upcomingToLive.affectedRows}, LIVE/STUCK→RESULT: ${liveToResult.affectedRows}`
//     );
//   } catch (err) {
//     console.error("❌ [CRON] syncMatchStatuses failed:", err.message);
//   }
// };

// /* ══════════════════════════════════════════
//    JOB 3 — PLAYER POINTS SYNC — every 2 mins ✅
//    Parallel sync for all LIVE/RESULT matches
// ══════════════════════════════════════════ */
// const syncPoints = async () => {
//   console.log("⏰ [CRON] Points sync started:", new Date().toISOString());
//   try {
//     const [matches] = await db.query(
//       `SELECT id, provider_match_id, start_time, status
//        FROM matches
//        WHERE is_active = 1
//          AND status IN ('LIVE', 'RESULT')
//          AND start_time >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
//        ORDER BY start_time DESC`
//     );

//     if (!matches.length) {
//       console.log("✅ [CRON] No live/completed matches needing points sync");
//       return;
//     }

//     console.log(`📊 [CRON] Syncing points for ${matches.length} match(es)...`);

//     // ✅ Parallel sync — faster than sequential for multiple matches
//     const results = await Promise.allSettled(
//       matches.map(match => syncPlayerPointsService(match.provider_match_id))
//     );

//     results.forEach((result, i) => {
//       const match = matches[i];
//       if (result.status === "fulfilled") {
//         const r = result.value;
//         if (r.reason) {
//           console.log(`⏳ [CRON] Match ${match.provider_match_id} — ${r.reason}`);
//         } else {
//           console.log(`✅ [CRON] Match ${match.provider_match_id} — [${match.status}] points synced: ${r.count} players`);
//         }
//       } else {
//         console.error(`❌ [CRON] Points sync failed for match ${match.provider_match_id}:`, result.reason?.message);
//       }
//     });

//   } catch (err) {
//     console.error("❌ [CRON] syncPoints job failed:", err.message);
//   }
// };

// /* ══════════════════════════════════════════
//    JOB 4 — LEADERBOARD CACHE — every 2 mins ✅
//    LIVE matches → Redis లో rank + points cache
// ══════════════════════════════════════════ */
// const cacheLeaderboards = async () => {
//   console.log("⏰ [CRON] Leaderboard cache started:", new Date().toISOString());
//   try {
//     const [liveContests] = await db.query(
//       `SELECT c.id AS contest_id, c.match_id
//        FROM contest c
//        JOIN matches m ON m.id = c.match_id
//        WHERE m.status = 'LIVE'
//          AND c.status = 'UPCOMING'`
//     );

//     if (!liveContests.length) {
//       console.log("✅ [CRON] No live contests to cache");
//       return;
//     }

//     // ✅ Parallel cache update for all live contestsjfg
//     await Promise.allSettled(
//       liveContests.map(c => computeAndCacheLeaderboard(c.contest_id, c.match_id))
//     );

//     console.log(`✅ [CRON] Leaderboard cached for ${liveContests.length} contest(s)`);
//   } catch (err) {
//     console.error("❌ [CRON] Leaderboard cache failed:", err.message);
//   }
// };

// /* ══════════════════════════════════════════
//    JOB 5 — CONTEST SCORING — every 10 mins
//    RESULT matches → pending contests score
// ══════════════════════════════════════════ */
// const scoreCompletedMatches = async () => {
//   console.log("⏰ [CRON] Contest scoring started:", new Date().toISOString());
//   try {
//     const [contests] = await db.query(
//       `SELECT c.id AS contestId, c.match_id AS matchId
//        FROM contest c
//        JOIN matches m ON m.id = c.match_id
//        WHERE m.is_active = 1
//          AND m.status = 'RESULT'
//          AND c.status IN ('UPCOMING', 'FULL')
//          AND m.start_time >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
//        ORDER BY c.id ASC`
//     );

//     if (!contests.length) {
//       console.log("✅ [CRON] No contests pending scoring");
//       return;
//     }

//     console.log(`🏆 [CRON] Scoring ${contests.length} contest(s)...`);

//     for (const contest of contests) {
//       try {
//         const result = await scoreContestService(contest.contestId, contest.matchId);
//         console.log(
//           `✅ [CRON] Contest ${contest.contestId} scored — ${result.totalEntries} entries, match ${contest.matchId}`
//         );
//         await sleep(500);
//       } catch (err) {
//         console.error(`❌ [CRON] Scoring failed for contest ${contest.contestId}:`, err.message);
//       }
//     }
//   } catch (err) {
//     console.error("❌ [CRON] scoreCompletedMatches job failed:", err.message);
//   }
// };

// /* ══════════════════════════════════════════
//    JOB 6 — CLEANUP — daily at 2 AM UTC
// ══════════════════════════════════════════ */
// const cleanupOldInactiveMatches = async () => {
//   console.log("🧹 [CRON] Cleanup job started:", new Date().toISOString());
//   try {
//     const [result] = await db.query(
//       `DELETE FROM matches
//        WHERE is_active = 0
//          AND start_time <= DATE_SUB(NOW(), INTERVAL 30 DAY)`
//     );
//     console.log(`✅ [CRON] Cleanup done — deleted ${result.affectedRows} old inactive matches`);
//   } catch (err) {
//     console.error("❌ [CRON] cleanupOldInactiveMatches failed:", err.message);
//   }
// };


// // Every 2 minutes — LIVE matches update
// cron.schedule('*/2 * * * *', async () => {
//   try {
//     const [liveMatches] = await db.query(
//       `SELECT id FROM matches WHERE status = 'LIVE'`
//     );
//     for (const match of liveMatches) {
//       await updateLiveScores(match.id);
//       console.log(`[LiveScoring] Match ${match.id} updated`);
//     }
//   } catch (err) {
//     console.error('[LiveScoring Cron]', err.message);
//   }
// });


// /* ══════════════════════════════════════════
//    REGISTER ALL CRON JOBS
// ══════════════════════════════════════════ */
// export const startCronJobs = () => {

//   // ✅ Lineup  — every 5 mins, 90-min window before kick-off
//   cron.schedule("*/5 * * * *",  syncLineups,              { scheduled: true, timezone: "UTC" });

//   // ✅ Status  — every 5 mins (UPCOMING→LIVE→RESULT)
//   cron.schedule("*/5 * * * *",  syncMatchStatuses,         { scheduled: true, timezone: "UTC" });

//   // ✅ Points  — every 2 mins for live feel (parallel sync)
//   cron.schedule("*/2 * * * *",  syncPoints,                { scheduled: true, timezone: "UTC" });

//   // ✅ Leaderboard — every 2 mins (Redis cache, parallel)
//   cron.schedule("*/2 * * * *",  cacheLeaderboards,         { scheduled: true, timezone: "UTC" });

//   // ✅ Scoring — every 10 mins (RESULT matches only)
//   cron.schedule("*/10 * * * *", scoreCompletedMatches,     { scheduled: true, timezone: "UTC" });

//   // ✅ Cleanup — daily 2 AM UTC
//   cron.schedule("0 2 * * *",    cleanupOldInactiveMatches, { scheduled: true, timezone: "UTC" });

//   // console.log("🚀 CRON STARTED [PRODUCTION]");
//   // console.log("📋 Lineup      → every 5 mins  (90 min window before kick-off + LIVE)");
//   // console.log("🔄 Status      → every 5 mins  (UPCOMING→LIVE→RESULT auto-transition)");
//   // console.log("📊 Points      → every 2 mins  (LIVE + RESULT, parallel sync) ✅");
//   // console.log("🏆 Leaderboard → every 2 mins  (LIVE matches, Redis cache, parallel) ✅");
//   // console.log("🥇 Scoring     → every 10 mins (RESULT matches, pending contests)");
//   // console.log("🧹 Cleanup     → daily 2 AM UTC (old inactive matches removed)");
// };



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
       ut.team_name,
       COALESCE(
         (SELECT SUM(
            CASE
              WHEN utp.is_captain      = 1 THEN pms.fantasy_points * 2
              WHEN utp.is_vice_captain = 1 THEN pms.fantasy_points * 1.5
              ELSE pms.fantasy_points
            END
          )
          FROM user_team_players utp
          JOIN player_match_stats pms
            ON pms.player_id = utp.player_id
           AND pms.match_id  = ?
          WHERE utp.user_team_id = ce.user_team_id
         ), 0
       ) AS total_points
     FROM contest_entries ce
     JOIN users u ON u.id = ce.user_id
     LEFT JOIN user_teams ut ON ut.id = ce.user_team_id
     WHERE ce.contest_id = ?
     ORDER BY total_points DESC`,
    [matchId, contestId]
  );

  // DENSE_RANK
  let rank = 1, lastPts = null, skip = 0;
  const ranked = entries.map(e => {
    const pts = parseFloat(e.total_points) || 0;
    if (lastPts === null)       { lastPts = pts; skip = 1; }
    else if (pts === lastPts)   { skip++; }
    else                        { rank += skip; skip = 1; lastPts = pts; }
    return {
      rank,
      user_id:       e.user_id,
      username:      e.nickname  || e.name || `User${e.user_id}`,
      profile_image: e.image     || null,
      team_name:     e.team_name || null,
      user_team_id:  e.user_team_id,
      points:        pts,
    };
  });

  await redis.set(
    leaderboardCacheKey(contestId),
    JSON.stringify(ranked),
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
// JOB 2 — MATCH STATUS — every 5 mins
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
// REGISTER ALL CRON JOBS
// ─────────────────────────────────────────────────────────────────────────────
export const startCronJobs = () => {

  // Lineup — every 5 mins
  cron.schedule("*/5 * * * *",  syncLineups,                    { scheduled: true, timezone: "UTC" });

  // Status — every 5 mins
  cron.schedule("*/5 * * * *",  syncMatchStatuses,              { scheduled: true, timezone: "UTC" });

  // Points + Leaderboard — every 2 mins (combined, order guaranteed)
  cron.schedule("*/2 * * * *",  syncPointsAndCacheLeaderboard,  { scheduled: true, timezone: "UTC" });

  // Scoring — every 10 mins
  cron.schedule("*/10 * * * *", scoreCompletedMatches,          { scheduled: true, timezone: "UTC" });

  // Cleanup — daily 2 AM
  cron.schedule("0 2 * * *",    cleanupOldInactiveMatches,      { scheduled: true, timezone: "UTC" });

  console.log("🚀 [CRON] All jobs registered");
};