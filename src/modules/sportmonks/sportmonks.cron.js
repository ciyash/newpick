import cron from "node-cron";
import db from "../../config/db.js";
import {
  syncPlayingXIService,
  syncPlayerPointsService,
} from "./sportmonks.service.js";

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
      `SELECT id, provider_match_id, start_time, lineup_status
       FROM matches
       WHERE is_active = 1
         AND status = 'UPCOMING'
         AND lineup_status != 'confirmed'
         AND start_time >= NOW()
         AND start_time <= ?
       ORDER BY start_time ASC`,
      [formatDateTime(sixtyMinsLater)]
    );

    if (!matches.length) {
      console.log("✅ [CRON] No upcoming matches needing lineup sync");
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
    const [upcomingToLive] = await db.query(
      `UPDATE matches
       SET status = 'LIVE'
       WHERE is_active = 1
         AND status = 'UPCOMING'
         AND start_time <= NOW()
         AND start_time >= DATE_SUB(NOW(), INTERVAL 3 HOUR)`
    );

    const [liveToResult] = await db.query(
      `UPDATE matches
       SET status = 'RESULT'
       WHERE is_active = 1
         AND status = 'LIVE'
         AND start_time <= DATE_SUB(NOW(), INTERVAL 150 MINUTE)`
    );

    console.log(
      `✅ [CRON] Match statuses updated | UPCOMING→LIVE: ${upcomingToLive.affectedRows}, LIVE→RESULT: ${liveToResult.affectedRows}`
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
      `SELECT m.id, m.provider_match_id, m.start_time
       FROM matches m
       WHERE m.is_active = 1
         AND m.status = 'RESULT'
         AND m.start_time >= DATE_SUB(NOW(), INTERVAL 6 HOUR)
         AND NOT EXISTS (
           SELECT 1 FROM player_match_stats pms
           WHERE pms.match_id = m.id
           LIMIT 1
         )
       ORDER BY m.start_time DESC`
    );

    if (!matches.length) {
      console.log("✅ [CRON] No completed matches needing points sync");
      return;
    }

    console.log(`📊 [CRON] Syncing points for ${matches.length} match(es)...`);

    for (const match of matches) {
      try {
        const result = await syncPlayerPointsService(match.provider_match_id);

        if (result.reason) {
          console.log(`⏳ [CRON] Match ${match.provider_match_id} — ${result.reason}`);
        } else {
          console.log(`✅ [CRON] Match ${match.provider_match_id} — points synced: ${result.count} players`);
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
   JOB 4 — CLEANUP — daily at 3 AM UTC
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

  // 4) Cleanup → daily at 3 AM UTC
  cron.schedule("0 3 * * *", cleanupOldInactiveMatches, {
    scheduled: true,
    timezone: "UTC",
  });

  console.log("🚀 CRON STARTED [TESTING MODE]");
  console.log("📋 Lineup  → every 5 mins (1 hour before match window)");
  console.log("🔄 Status  → every 5 mins");
  console.log("📊 Points  → every 5 mins");
  console.log("🧹 Cleanup → daily at 3 AM UTC");
};