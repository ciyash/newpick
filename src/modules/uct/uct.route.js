import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { generateUCTTeams, getUserUCTTeams } from "./uct.controller.js";
import { generateUCTSchema } from "./utc.validation.js";
import { validate } from "../../middlewares/validate.js";

const router = Router();

// ⭐ UCT — Auto Generate 20 Teams fkjdnkd

router.post("/generate", authenticate, validate(generateUCTSchema),  generateUCTTeams);

router.get("/my-teams", authenticate, getUserUCTTeams);


export default router;