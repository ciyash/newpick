import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { generateUCTTeams } from "./uct.controller.js";
import { generateUCTSchema } from "./utc.validation.js";
import { validate } from "../../middlewares/validate.js";

const router = Router();

// ⭐ UCT — Auto Generate 20 Teams  ok
// router.post("/generate", authenticate, generateUCTTeams);

router.post("/generate", authenticate, validate(generateUCTSchema),  generateUCTTeams);

export default router;