import cron from "node-cron";
import db from "../../config/db.js";
import {
  syncPlayingXIService,
  syncPlayerPointsService,
} from "./entitysport.service.js";

/* ══════════════════════════════════════════
   EVERY 15 MINUTES — match start కి 1 hr 
   లోపు ఉన్న matches కి playing XI poll
══════════════════════════════════════════ */

cron.schedule("*/15 * * * *", async () => {
  try {
    const [matches] = await db.query(
      `SELECT provider_match_id FROM matches
       WHERE is_active = 1
         AND status = 'upcoming'
         AND CONCAT(matchdate, ' ', start_time)
             BETWEEN DATE_SUB(NOW(), INTERVAL 30 MINUTE)
             AND DATE_ADD(NOW(), INTERVAL 1 HOUR)`
    );

    if (!matches.length) return; // ✅ silent — no log, no API call

    console.log(`[CRON] Playing XI — ${matches.length} matches to check`);

    for (const match of matches) {
      try {
        const result = await syncPlayingXIService(match.provider_match_id);
        if (result.count > 0) {
          console.log(`[CRON] ✓ Playing XI synced: ${match.provider_match_id} (${result.count} players)`);
        } else {
          console.log(`[CRON] — ${match.provider_match_id}: ${result.reason}`);
        }
      } catch (err) {
        console.error(`[CRON] ✗ Playing XI failed: ${match.provider_match_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[CRON] ✗ Playing XI poll error:", err.message);
  }
});

/* ══════════════════════════════════════════
   EVERY 10 MINUTES — live/completed matches
   కి player points sync
══════════════════════════════════════════ */

cron.schedule("*/10 * * * *", async () => {
  try {
    const [matches] = await db.query(
      `SELECT provider_match_id FROM matches
       WHERE is_active = 1
         AND status IN ('live', 'result')
         AND CONCAT(matchdate, ' ', start_time)
             BETWEEN DATE_SUB(NOW(), INTERVAL 5 HOUR)
             AND DATE_ADD(NOW(), INTERVAL 2 HOUR)`
    );

    if (!matches.length) return; // ✅ silent — no log, no API call

    console.log(`[CRON] Points sync — ${matches.length} matches to check`);

    for (const match of matches) {
      try {
        const result = await syncPlayerPointsService(match.provider_match_id);
        if (result.count > 0) {
          console.log(`[CRON] ✓ Points synced: ${match.provider_match_id} (${result.count} players)`);
        } else {
          console.log(`[CRON] — ${match.provider_match_id}: ${result.reason}`);
        }
      } catch (err) {
        console.error(`[CRON] ✗ Points failed: ${match.provider_match_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[CRON] ✗ Points sync error:", err.message);
  }
});
