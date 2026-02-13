import express from "express";
import { getAllTeams, getTeamById ,getAllPlayers,getPlayerById} from "./team.controller.js"
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/get-teams", authenticate, checkAccountActive, getAllTeams);
router.get("/get-teams/:id", authenticate, checkAccountActive, getTeamById);

router.get("/team-players", authenticate, checkAccountActive, getAllPlayers);
router.get("/team-players/:id", authenticate, checkAccountActive, getPlayerById);


export default router;
