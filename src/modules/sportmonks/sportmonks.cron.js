// import cron from "node-cron";
// import db from "../../config/db.js";
// import {
//   syncPlayingXIService,
//   syncPlayerPointsService,
// } from "./sportmonks.service.js";

// const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// const formatDateTime = (date) => {
//   return date.toISOString().slice(0, 19).replace("T", " ");
// };

// /* ══════════════════════════════════════════
//    JOB 1 — LINEUP SYNC — every 5 mins
//    UPCOMING (60 min window) + LIVE matches
// ══════════════════════════════════════════ */
// const syncLineups = async () => {
//   console.log("⏰ [CRON] Lineup sync started:", new Date().toISOString());

//   try {
//     const now            = new Date();
//     const sixtyMinsLater = new Date(now.getTime() + 60 * 60 * 1000);

//     const [matches] = await db.query(
//       `SELECT id, provider_match_id, start_time, lineup_status, status
//        FROM matches
//        WHERE is_active = 1
//          AND lineup_status != 'confirmed'
//          AND (
//            (status = 'UPCOMING' AND start_time BETWEEN NOW() AND ?)
//            OR
//            (status = 'LIVE')
//          )
//        ORDER BY start_time ASC`,
//       [formatDateTime(sixtyMinsLater)]
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
//           console.log(
//             `⏳ [CRON] Match ${match.provider_match_id} — ${result.reason} (will retry)`
//           );
//         } else {
//           console.log(
//             `✅ [CRON] Match ${match.provider_match_id} — lineup confirmed: ${result.count} players`
//           );
//         }

//         await sleep(1000);
//       } catch (err) {
//         console.error(
//           `❌ [CRON] Lineup sync failed for match ${match.provider_match_id}:`,
//           err.message
//         );
//       }
//     }
//   } catch (err) {
//     console.error("❌ [CRON] syncLineups job failed:", err.message);
//   }
// };

// /* ══════════════════════════════════════════
//    JOB 2 — MATCH STATUS SYNC — every 5 mins
//    UPCOMING → LIVE → RESULT
// ══════════════════════════════════════════ */
// const syncMatchStatuses = async () => {
//   console.log("⏰ [CRON] Match status sync started:", new Date().toISOString());

//   try {
//     // UPCOMING → LIVE: start_time past అయింది, 3 hrs లోపు
//     const [upcomingToLive] = await db.query(
//       `UPDATE matches
//        SET status = 'LIVE'
//        WHERE is_active = 1
//          AND status = 'UPCOMING'
//          AND start_time <= NOW()
//          AND start_time >= DATE_SUB(NOW(), INTERVAL 3 HOUR)`
//     );

//     // LIVE → RESULT: start_time 150 mins (2.5 hrs) కంటే ముందు
//     const [liveToResult] = await db.query(
//       `UPDATE matches
//        SET status = 'RESULT'
//        WHERE is_active = 1
//          AND status = 'LIVE'
//          AND start_time <= DATE_SUB(NOW(), INTERVAL 150 MINUTE)`
//     );

//     console.log(
//       `✅ [CRON] Statuses updated | UPCOMING→LIVE: ${upcomingToLive.affectedRows}, LIVE→RESULT: ${liveToResult.affectedRows}`
//     );
//   } catch (err) {
//     console.error("❌ [CRON] syncMatchStatuses failed:", err.message);
//   }
// };

// /* ══════════════════════════════════════════
//    JOB 3 — PLAYER POINTS SYNC — every 5 mins
//    RESULT matches, last 6 hrs, no stats yet
// ══════════════════════════════════════════ */

// const syncPoints = async () => {
//   console.log("⏰ [CRON] Points sync started:", new Date().toISOString());

//   try {
//     const [matches] = await db.query(
//       `SELECT m.id, m.provider_match_id, m.start_time, m.status
//        FROM matches m
//        WHERE m.is_active = 1
//          AND m.status IN ('LIVE', 'RESULT')
//          AND m.start_time >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
//        ORDER BY m.start_time DESC`
//     );

//     if (!matches.length) {
//       console.log("✅ [CRON] No live/completed matches needing points sync");
//       return;
//     }

//     console.log(`📊 [CRON] Syncing points for ${matches.length} match(es)...`);

//     for (const match of matches) {
//       try {
//         const result = await syncPlayerPointsService(match.provider_match_id);

//         if (result.reason) {
//           console.log(`⏳ [CRON] Match ${match.provider_match_id} — ${result.reason}`);
//         } else {
//           console.log(
//             `✅ [CRON] Match ${match.provider_match_id} — [${match.status}] points synced: ${result.count} players`
//           );
//         }

//         await sleep(1000);
//       } catch (err) {
//         console.error(
//           `❌ [CRON] Points sync failed for match ${match.provider_match_id}:`,
//           err.message
//         );
//       }
//     }
//   } catch (err) {
//     console.error("❌ [CRON] syncPoints job failed:", err.message);
//   }
// };


// /* ══════════════════════════════════════════
//    JOB 4 — CLEANUP — daily at 2 AM UTC
//    30 days పాత inactive matches delete
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

// /* ══════════════════════════════════════════
//    REGISTER ALL CRON JOBS
// ══════════════════════════════════════════ */
// export const startCronJobs = () => {
//   // 1) Lineup sync → every 5 mins (UPCOMING 60min window + LIVE)
//   cron.schedule("*/5 * * * *", syncLineups, {
//     scheduled: true,
//     timezone: "UTC",
//   });

//   // 2) Match status sync → every 5 mins
//   cron.schedule("*/5 * * * *", syncMatchStatuses, {
//     scheduled: true,
//     timezone: "UTC",
//   });

//   // 3) Points sync → every 5 mins
//   cron.schedule("*/5 * * * *", syncPoints, {
//     scheduled: true,
//     timezone: "UTC",
//   });

//   // 4) Cleanup → daily at 2 AM UTC
//   cron.schedule("0 2 * * *", cleanupOldInactiveMatches, {
//     scheduled: true,
//     timezone: "UTC",
//   });

//   console.log("🚀 CRON STARTED [PRODUCTION]");
//   console.log("📋 Lineup  → every 5 mins (60 min before match + LIVE)");
//   console.log("🔄 Status  → every 5 mins (UPCOMING→LIVE→RESULT)");
//   console.log("📊 Points  → every 5 mins (RESULT matches only)");
//   console.log("🧹 Cleanup → daily at 2 AM UTC");
// };




import cron from "node-cron";
import db from "../../config/db.js";
import {
  syncPlayingXIService,
  syncPlayerPointsService,
} from "./sportmonks.service.js";
import { scoreContestService } from "../scoring/scoring.service.js"; // ✅ add

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
 
const formatDateTime = (date) => {
  return date.toISOString().slice(0, 19).replace("T", " ");
};

/* ══════════════════════════════════════════
   JOB 1 — LINEUP SYNC — every 5 mins
══════════════════════════════════════════ */
const syncLineups = async () => {
  console.log("⏰ [CRON] Lineup sync started:", new Date().toISOString());

  try {
    const now            = new Date();
    const sixtyMinsLater = new Date(now.getTime() + 60 * 60 * 1000);

    const [matches] = await db.query(
      `SELECT id, provider_match_id, start_time, lineup_status, status
       FROM matches
       WHERE is_active = 1
         AND lineup_status != 'confirmed'
         AND (
           (status = 'UPCOMING' AND start_time BETWEEN NOW() AND ?)
           OR
           (status = 'LIVE')
         )
       ORDER BY start_time ASC`,
      [formatDateTime(sixtyMinsLater)]
    );

    if (!matches.length) {
      console.log("✅ [CRON] No matches needing lineup sync");
      return;
    }

    console.log(`📋 [CRON] Checking lineup for ${matches.length} match(es)...`);

    for (const match of matches) {
      try {
        const result = await syncPlayingXIService(match.provider_match_id);

        if (result.reason) {
          console.log(`⏳ [CRON] Match ${match.provider_match_id} — ${result.reason} (will retry)`);
        } else {
          console.log(`✅ [CRON] Match ${match.provider_match_id} — lineup confirmed: ${result.count} players`);
        }

        await sleep(1000);
      } catch (err) {
        console.error(`❌ [CRON] Lineup sync failed for match ${match.provider_match_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ [CRON] syncLineups job failed:", err.message);
  }
};

/* ══════════════════════════════════════════
   JOB 2 — MATCH STATUS SYNC — every 5 mins
══════════════════════════════════════════ */

const syncMatchStatuses = async () => {
  console.log("⏰ [CRON] Match status sync started:", new Date().toISOString());

  try {
    /* ─── UPCOMING → LIVE ─── */
    const [upcomingToLive] = await db.query(
      `UPDATE matches
       SET status = 'LIVE'
       WHERE is_active = 1
         AND status = 'UPCOMING'
         AND start_time <= NOW()`
    );

    /* ─── LIVE / STUCK UPCOMING → RESULT ─── */
    const [liveToResult] = await db.query(
      `UPDATE matches
       SET status = 'RESULT'
       WHERE is_active = 1
         AND status IN ('UPCOMING', 'LIVE')
         AND start_time <= DATE_SUB(NOW(), INTERVAL 150 MINUTE)`
    );

    console.log(
      `✅ [CRON] Statuses updated | UPCOMING→LIVE: ${upcomingToLive.affectedRows}, LIVE/STUCK→RESULT: ${liveToResult.affectedRows}`
    );
  } catch (err) {
    console.error("❌ [CRON] syncMatchStatuses failed:", err.message);
  }
};

/* ══════════════════════════════════════════
   JOB 3 — PLAYER POINTS SYNC — every 5 mins
══════════════════════════════════════════ */
const syncPoints = async () => {
  console.log("⏰ [CRON] Points sync started:", new Date().toISOString());

  try {
    const [matches] = await db.query(
      `SELECT m.id, m.provider_match_id, m.start_time, m.status
       FROM matches m
       WHERE m.is_active = 1
         AND m.status IN ('LIVE', 'RESULT')
         AND m.start_time >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
       ORDER BY m.start_time DESC`
    );

    if (!matches.length) {
      console.log("✅ [CRON] No live/completed matches needing points sync");
      return;
    }

    console.log(`📊 [CRON] Syncing points for ${matches.length} match(es)...`);

    for (const match of matches) {
      try {
        const result = await syncPlayerPointsService(match.provider_match_id);

        if (result.reason) {
          console.log(`⏳ [CRON] Match ${match.provider_match_id} — ${result.reason}`);
        } else {
          console.log(
            `✅ [CRON] Match ${match.provider_match_id} — [${match.status}] points synced: ${result.count} players`
          );
        }

        await sleep(1000);
      } catch (err) {
        console.error(`❌ [CRON] Points sync failed for match ${match.provider_match_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ [CRON] syncPoints job failed:", err.message);
  }
};

/* ══════════════════════════════════════════
   JOB 4 — CONTEST SCORING — every 10 mins  ✅ NEW
   RESULT matches → UPCOMING contests score
══════════════════════════════════════════ */
const scoreCompletedMatches = async () => {
  console.log("⏰ [CRON] Contest scoring started:", new Date().toISOString());

  try {
    // RESULT అయిన matches లో UPCOMING/FULL contests fetch
    // scored_at NULL → ఇంకా scoring జరగలేదు
    const [contests] = await db.query(
      `SELECT c.id AS contestId, c.match_id AS matchId
       FROM contest c
       JOIN matches m ON m.id = c.match_id
       WHERE m.is_active = 1
         AND m.status = 'RESULT'
         AND c.status IN ('UPCOMING', 'FULL')
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
          `✅ [CRON] Contest ${contest.contestId} scored — ${result.totalEntries} entries, match ${contest.matchId}`
        );

        await sleep(500);
      } catch (err) {
        console.error(
          `❌ [CRON] Scoring failed for contest ${contest.contestId}:`,
          err.message
        );
      }
    }
  } catch (err) {
    console.error("❌ [CRON] scoreCompletedMatches job failed:", err.message);
  }
};

/* ══════════════════════════════════════════
   JOB 5 — CLEANUP — daily at 2 AM UTC
══════════════════════════════════════════ */
const cleanupOldInactiveMatches = async () => {
  console.log("🧹 [CRON] Cleanup job started:", new Date().toISOString());

  try {
    const [result] = await db.query(
      `DELETE FROM matches
       WHERE is_active = 0
         AND start_time <= DATE_SUB(NOW(), INTERVAL 30 DAY)`
    );

    console.log(`✅ [CRON] Cleanup done — deleted ${result.affectedRows} old inactive matches`);
  } catch (err) {
    console.error("❌ [CRON] cleanupOldInactiveMatches failed:", err.message);
  }
};

/* ══════════════════════════════════════════
   REGISTER ALL CRON JOBS
══════════════════════════════════════════ */
export const startCronJobs = () => {
  // 1) Lineup sync → every 5 mins
  cron.schedule("*/5 * * * *", syncLineups, {
    scheduled: true,
    timezone: "UTC",
  });

  // 2) Match status sync → every 5 mins
  cron.schedule("*/5 * * * *", syncMatchStatuses, {
    scheduled: true,
    timezone: "UTC",
  });

  // 3) Points sync → every 5 mins
  cron.schedule("*/5 * * * *", syncPoints, {
    scheduled: true,
    timezone: "UTC",
  });

  // 4) Contest scoring → every 10 mins ✅ NEW
  cron.schedule("*/10 * * * *", scoreCompletedMatches, {
    scheduled: true,
    timezone: "UTC",
  });

  // 5) Cleanup → daily at 2 AM UTC
  cron.schedule("0 2 * * *", cleanupOldInactiveMatches, {
    scheduled: true,
    timezone: "UTC",
  });

  console.log("🚀 CRON STARTED [PRODUCTION]");
  console.log("📋 Lineup   → every 5 mins (60 min before match + LIVE)");
  console.log("🔄 Status   → every 5 mins (UPCOMING→LIVE→RESULT)");
  console.log("📊 Points   → every 5 mins (RESULT matches only)");
  console.log("🏆 Scoring  → every 10 mins (RESULT matches, pending contests)"); // ✅
  console.log("🧹 Cleanup  → daily at 2 AM UTC");
};