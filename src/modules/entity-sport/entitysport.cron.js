import cron from "node-cron";
import axios from "axios";
import db from "../../config/db.js";
import {
  syncPlayingXIService,
  syncPlayerPointsService,
} from "./entitysport.service.js";

const TOKEN = process.env.ENTITYSPORT_TOKEN;
const BASE_URL = "https://soccerapi.entitysport.com";

const apiGet = async (endpoint, params = {}) => {
  const { data } = await axios.get(`${BASE_URL}${endpoint}`, {
    params: { token: TOKEN, ...params },
  });
  return data;
};

/* ══════════════════════════════════════════
   EVERY 25 MIN  — Match status + lineup sync
══════════════════════════════════════════ */
cron.schedule("*/25 * * * *", async () => {
  try {
    const [matches] = await db.query(
      `SELECT id, provider_match_id, status, lineup_status
       FROM matches
       WHERE is_active = 1
         AND status != 'RESULT'
         AND CONCAT(matchdate, ' ', start_time)
             BETWEEN DATE_SUB(NOW(), INTERVAL 6 HOUR)
             AND DATE_ADD(NOW(), INTERVAL 6 HOUR)`
    );

    if (!matches.length) return;

    console.log(`[CRON] Status sync — ${matches.length} matches`);

    for (const match of matches) {
      try {
        const data = await apiGet(`/matches/${match.provider_match_id}/info`);
        const matchInfo = data?.response?.items?.match_info?.[0];
        if (!matchInfo) continue;

        const apiStatus = (matchInfo.status_str || "").toLowerCase();
        let dbStatus = "UPCOMING";

        if (apiStatus === "result" || matchInfo.gamestate_str === "Ended") {
          dbStatus = "RESULT";
        } else if (["live", "halftime", "inprogress"].includes(apiStatus)) {
          dbStatus = "LIVE";
        }

        const lineupAvailable = matchInfo.lineupavailable === "true" ? 1 : 0;

        await db.query(
          `UPDATE matches
           SET status          = ?,
               lineupavailable = ?
           WHERE id = ?`,
          [dbStatus, lineupAvailable, match.id]
        );

        console.log(`[CRON] ✓ ${match.provider_match_id}: ${match.status} → ${dbStatus} | lineup: ${lineupAvailable}`);
      } catch (err) {
        console.error(`[CRON] ✗ Status failed: ${match.provider_match_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[CRON] ✗ Status sync error:", err.message);
  }
});

/* ══════════════════════════════════════════
   EVERY 58 MIN — Playing XI sync
══════════════════════════════════════════ */
cron.schedule("*/58 * * * *", async () => {
  try {
    const [matches] = await db.query(
      `SELECT provider_match_id FROM matches
       WHERE is_active = 1
         AND status IN ('UPCOMING', 'LIVE')
         AND lineup_status != 'confirmed'
         AND CONCAT(matchdate, ' ', start_time)
             BETWEEN DATE_SUB(NOW(), INTERVAL 6 HOUR)
             AND DATE_ADD(NOW(), INTERVAL 6 HOUR)`
    );

    if (!matches.length) return;

    console.log(`[CRON] Playing XI — ${matches.length} matches`);

    for (const match of matches) {
      try {
        const result = await syncPlayingXIService(match.provider_match_id);
        if (result.count > 0) {
          console.log(`[CRON] ✓ XI synced: ${match.provider_match_id} (${result.count} players)`);
        } else {
          console.log(`[CRON] — ${match.provider_match_id}: ${result.reason}`);
        }
      } catch (err) {
        console.error(`[CRON] ✗ XI failed: ${match.provider_match_id}:`, err.message);
      }
    }
  } catch (err) {
    console.error("[CRON] ✗ XI poll error:", err.message);
  }
});

/* ══════════════════════════════════════════
   EVERY 58 MIN — Player points sync
══════════════════════════════════════════ */
cron.schedule("*/58 * * * *", async () => {
  try {
    const [matches] = await db.query(
      `SELECT provider_match_id FROM matches
       WHERE is_active = 1
         AND status IN ('LIVE', 'RESULT')
         AND CONCAT(matchdate, ' ', start_time)
             BETWEEN DATE_SUB(NOW(), INTERVAL 8 HOUR)
             AND DATE_ADD(NOW(), INTERVAL 2 HOUR)`
    );

    if (!matches.length) return;

    console.log(`[CRON] Points sync — ${matches.length} matches`);

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