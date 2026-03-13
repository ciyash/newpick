import express from "express";

import {
  syncCompetitions,
  syncMatches,
  syncMatchSquad
} from "./entitysport.controller.js";

const router = express.Router();

router.get("/sync-competitions", syncCompetitions);

router.get("/sync-matches/:competition_id", syncMatches);

router.get("/sync-squad/:match_id", syncMatchSquad);

export default router;