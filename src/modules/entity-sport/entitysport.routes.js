import express from "express";
import {
  getAvailableSeries,
  toggleSeries,
  getAvailableMatches,
  toggleMatches,
  syncPlayingXI,
  syncPlayerPoints,
  getMatches,
  getActiveSeries,
} from "./entitysport.controller.js";


const router = express.Router();

/* ══════════════════════════════════════════
   SERIES
══════════════════════════════════════════ */
router.get("/series/available",               getAvailableSeries);
router.post("/series/toggle",                 toggleSeries);
router.get("/series/active",  getActiveSeries);
/* ══════════════════════════════════════════
   MATCHES
══════════════════════════════════════════ */
router.get("/matches/available/:seriesid",    getAvailableMatches);
router.post("/matches/toggle",                toggleMatches);
router.get("/matches/:seriesid",  getMatches);

/* ══════════════════════════════════════════
   SYNC — toggleMatches auto-creates teams
   syncTeams  → not needed (auto in toggle)
   syncMatches → not needed (auto in toggle)
══════════════════════════════════════════ */

router.get("/sync-playingxi/:match_id",       syncPlayingXI);
router.get("/sync-points/:match_id",          syncPlayerPoints);

export default router;   
