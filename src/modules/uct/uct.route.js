import { Router } from "express";

import { generateUCTTeams, getUserUCTTeams } from "./uct.controller.js";
import { generateUCTSchema } from "./utc.validation.js";
import { validate } from "../../middlewares/validate.js";

const router = Router();

// ⭐ UCT — Auto Generate 20 Teams fkjdnkd

router.post("/generate",  validate(generateUCTSchema),  generateUCTTeams);

router.get("/my-teams",  getUserUCTTeams);


export default router;