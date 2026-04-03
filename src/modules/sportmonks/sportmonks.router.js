import express from "express";
import {
  getAvailableSeries,
  toggleSeries,
  getActiveSeries,
  getAvailableMatches,
  toggleMatches,
  getMatches,
  syncPlayingXI,
  syncPlayerPoints,
  manualSyncPlayingXI,
} from "./sportmonks.controller.js";

const router = express.Router();

/* ══════════════════════════════════════════
   SERIES
══════════════════════════════════════════ */
router.get("/series/available",            getAvailableSeries);
router.post("/series/toggle",              toggleSeries);
router.get("/series/active",               getActiveSeries);
  
/* ══════════════════════════════════════════
   MATCHES
══════════════════════════════════════════ */
router.get("/matches/available/:seriesid", getAvailableMatches);
router.post("/matches/toggle",             toggleMatches);
router.get("/matches/:seriesid",           getMatches);

/* ══════════════════════════════════════════
   SYNC
══════════════════════════════════════════ */
router.get("/sync-playingxi/:match_id",    syncPlayingXI);
router.get("/sync-points/:match_id",       syncPlayerPoints);


//  tetsing   playing xi sync 

router.get("/manual-sync-playingxi/:match_id", manualSyncPlayingXI);

export default router;