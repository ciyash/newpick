import express from "express";
import { getAllTeams, getTeamById ,getAllPlayers,getPlayerById,getPlayerTeamById,createTeam,getMyTeams,getTeamPlayers, getMyTeamsWithPlayers, updateTeam} from "./team.controller.js"
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/get-teams", authenticate, checkAccountActive, getAllTeams);

router.get("/get-teams/:id", authenticate, checkAccountActive, getTeamById);

router.get("/team-players", authenticate, checkAccountActive, getAllPlayers);

router.get("/team-players/team/:id", authenticate, checkAccountActive, getPlayerTeamById);

router.get("/team-players/:id", authenticate, checkAccountActive, getPlayerById); // 

router.post("/create", authenticate, checkAccountActive, createTeam);  

router.get("/user-my-teams/:matchId", authenticate, checkAccountActive, getMyTeams);

router.get("/players/:teamId", authenticate, checkAccountActive, getTeamPlayers);

router.get("/my-teams-with-players", authenticate, checkAccountActive, getMyTeamsWithPlayers);

router.put("/update-team/:teamId", authenticate, checkAccountActive,  updateTeam);

export default router;
 