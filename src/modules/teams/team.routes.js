import express from "express";
import {
  getAllTeams,
  getTeamById,
  getAllPlayers,
  getPlayerById,
  getPlayerTeamById,
  createTeam,
  getMyTeams,
  getTeamPlayers,
  getMyTeamsWithPlayers,
  updateTeam,
} from "./team.controller.js";
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";
import { createTeamRateLimit, updateTeamRateLimit } from "../../middlewares/rateLimit.middleware.js";

const router = express.Router();

// ─── Players (public-ish, no rate limit needed) ────────────────────────────

router.get("/players",                  authenticate, checkAccountActive, getAllPlayers);
router.get("/players/:id",              authenticate, checkAccountActive, getPlayerById);
router.get("/players/team/:id",         authenticate, checkAccountActive, getPlayerTeamById);

// ─── Teams (general) ───────────────────────────────────────────────────────

router.get("/",                         authenticate, checkAccountActive, getAllTeams);
router.get("/:id",                      authenticate, checkAccountActive, getTeamById);

// ─── User teams ────────────────────────────────────────────────────────────
router.post("/create",                  authenticate, checkAccountActive, createTeamRateLimit, createTeam);
router.patch("/update/:teamId",         authenticate, checkAccountActive, updateTeamRateLimit, updateTeam);

router.get("/my-teams/:matchId",        authenticate, checkAccountActive, getMyTeams);
router.get("/my-teams/with-players",    authenticate, checkAccountActive, getMyTeamsWithPlayers);
router.get("/my-teams/players/:teamId", authenticate, checkAccountActive, getTeamPlayers);

export default router;