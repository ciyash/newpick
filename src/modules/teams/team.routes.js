import express from "express";
import { getAllTeams, getTeamById, getAllPlayers, getPlayerById, getPlayerTeamById, createTeam, getMyTeams, getTeamPlayers, getMyTeamsWithPlayers, updateTeam, getMyTeamsXIStatus, getPlayingXI, getTeamComparison } from "./team.controller.js";
import { generateTeams } from "./generateTeams.controller.js";
import { createTeamRateLimit, updateTeamRateLimit } from "../../middlewares/rateLimit.middleware.js";

const router = express.Router();

router.get("/get-teams", getAllTeams);

router.get("/get-teams/:id", getTeamById);

router.get("/team-players", getAllPlayers); 

router.get("/team-players/team/:id", getPlayerTeamById);

router.get("/team-players/:id", getPlayerById);

// user created teams after joining contest
router.post("/create", createTeamRateLimit, createTeam);
router.post("/generateTeams", createTeamRateLimit, generateTeams);

router.put("/update-team/:teamId", updateTeamRateLimit, updateTeam);

router.get("/user-my-teams/:matchId", getMyTeams);

router.get("/players/:teamId", getTeamPlayers);

router.get("/my-teams-with-players", getMyTeamsWithPlayers);


router.get("/my-teams/xi-status/:matchId/:homeTeamId", getMyTeamsXIStatus);

// uct purpose only
router.get("/playing-xi/:match_id", getPlayingXI);

router.get("/team-comparison/:team_id", getTeamComparison);

export default router;           