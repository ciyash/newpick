import express from "express";
import { getAllTeams, getTeamById ,getAllPlayers,getPlayerById,getPlayerTeamById,createTeam,getMyTeams,getTeamPlayers, getMyTeamsWithPlayers, updateTeam, getMyTeamsXIStatus, getPlayingXI} from "./team.controller.js";
import { generateTeams} from "./generateTeams.controller.js";
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";
import { createTeamRateLimit,updateTeamRateLimit } from "../../middlewares/rateLimit.middleware.js";

const router = express.Router();

router.get("/get-teams", authenticate, checkAccountActive, getAllTeams);

router.get("/get-teams/:id", authenticate, checkAccountActive, getTeamById);

router.get("/team-players", authenticate, checkAccountActive, getAllPlayers);

router.get("/team-players/team/:id", authenticate, checkAccountActive, getPlayerTeamById);

router.get("/team-players/:id", authenticate, checkAccountActive, getPlayerById);  

// user created teams after joining contest
router.post("/create", authenticate, checkAccountActive, createTeamRateLimit, createTeam);
router.post("/generateTeams", authenticate, checkAccountActive, createTeamRateLimit, generateTeams);

router.put("/update-team/:teamId", authenticate, checkAccountActive, updateTeamRateLimit, updateTeam);

router.get("/user-my-teams/:matchId", authenticate, checkAccountActive, getMyTeams);

router.get("/players/:teamId", authenticate, checkAccountActive, getTeamPlayers);

router.get("/my-teams-with-players", authenticate, checkAccountActive, getMyTeamsWithPlayers);


router.get("/my-teams/xi-status/:matchId/:homeTeamId", authenticate, checkAccountActive, getMyTeamsXIStatus);

// uct purpose only
router.get("/playing-xi/:match_id", getPlayingXI);

export default router;      