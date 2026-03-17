import express from "express";
import {
  getAvailableSeries,
  toggleSeries,
  getAvailableMatches,
  toggleMatches,
  syncPlayers,
  syncPlayingXI,
  syncPlayerPoints,
  getMatches,
} from "./entitysport.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = express.Router();

/* ══════════════════════════════════════════
   SERIES
══════════════════════════════════════════ */
router.get("/series/available",              adminAuth(), getAvailableSeries);
router.post("/series/toggle",                adminAuth(), toggleSeries);

/* ══════════════════════════════════════════
   MATCHES
══════════════════════════════════════════ */
router.get("/matches/available/:seriesid",   adminAuth(), getAvailableMatches);
router.post("/matches/toggle",               adminAuth(), toggleMatches);
router.get("/matches/:seriesid", adminAuth(), getMatches);

/* ══════════════════════════════════════════
   SYNC — toggleMatches auto-creates teams
   syncTeams  → not needed (auto in toggle)
   syncMatches → not needed (auto in toggle)
══════════════════════════════════════════ */
router.get("/sync-players/:match_id",        adminAuth(), syncPlayers);
router.get("/sync-playingxi/:match_id",      adminAuth(), syncPlayingXI);
router.get("/sync-points/:match_id",         adminAuth(), syncPlayerPoints);

export default router;