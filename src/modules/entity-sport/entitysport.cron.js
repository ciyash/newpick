import cron from "node-cron";
import db from "../../config/db.js";
import {
  syncPlayingXIService,
  syncPlayerPointsService,
} from "./entitysport.service.js";

/* ══════════════════════════════════════════
   EVERY 15 MINUTES — kick-off 3 గంటల లోపు
   ఉన్న matches కి playing XI poll చేయి
══════════════════════════════════════════ */

cron.schedule("*/15 * * * *", async () => {
  console.log("[CRON] Polling playing XI...");
  try {
    const [matches] = await db.query(
      `SELECT provider_match_id FROM matches
       WHERE is_active = 1
         AND status = 'upcoming'
         AND start_time BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 3 HOUR)`
    );

    if (!matches.length) {
      console.log("[CRON] No upcoming matches within 3 hours — skipping");
      return;
    }

    for (const match of matches) {
      try {
        const result = await syncPlayingXIService(match.provider_match_id);
        if (result.count > 0) {
          console.log(`[CRON] ✓ Playing XI synced for match ${match.provider_match_id} (${result.count} players)`);
        } else {
          console.log(`[CRON] — Match ${match.provider_match_id}: ${result.reason}`);
        }
      } catch (err) {
        console.error(`[CRON] ✗ Playing XI failed for match ${match.provider_match_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[CRON] ✗ Playing XI poll failed:", err.message);
  }
});

/* ══════════════════════════════════════════
   EVERY 10 MINUTES — live/completed matches కి
   player points sync చేయి
══════════════════════════════════════════ */

cron.schedule("*/10 * * * *", async () => {
  console.log("[CRON] Syncing player points...");
  try {
    const [matches] = await db.query(
      `SELECT provider_match_id FROM matches
       WHERE is_active = 1
         AND status IN ('live', 'result')`
    );

    if (!matches.length) {
      console.log("[CRON] No live/completed matches — skipping");
      return;
    }

    for (const match of matches) {
      try {
        const result = await syncPlayerPointsService(match.provider_match_id);
        if (result.count > 0) {
          console.log(`[CRON] ✓ Points synced for match ${match.provider_match_id} (${result.count} players)`);
        } else {
          console.log(`[CRON] — Match ${match.provider_match_id}: ${result.reason}`);
        }
      } catch (err) {
        console.error(`[CRON] ✗ Points sync failed for match ${match.provider_match_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[CRON] ✗ Player points sync failed:", err.message);
  }
});