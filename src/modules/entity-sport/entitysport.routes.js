import express from "express";

import {
  syncTeams,
  syncPlayingXI,
  syncPlayerPoints
} from "./entitysport.controller.js";

const router = express.Router();

/* ===============================
   TEAMS
================================ */

router.get("/sync-teams/:competition_id", syncTeams);

/* ===============================
   PLAYING XI
================================ */

router.get("/sync-playing-xi/:match_id", syncPlayingXI);

/* ===============================
   PLAYER POINTS
================================ */

router.get("/sync-player-points/:match_id", syncPlayerPoints);

export default router;