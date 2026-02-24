import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { generateUCTTeams } from "./uct.controller.js";

const router = Router();

// ⭐ UCT — Auto Generate 20 Teams
router.post("/generate", authenticate, generateUCTTeams);

export default router;