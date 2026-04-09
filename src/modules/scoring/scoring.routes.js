import express from "express";

import { scoreContest } from "./scoring.controller.js";


const router = express.Router();

// admin route to trigger scoring for a contest

router.post("/contest/:contestId", scoreContest);

export default router;  