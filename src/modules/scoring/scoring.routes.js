import express from "express";

import { scoreContest } from "./scoring.controller.js";


const router = express.Router();

router.post("/contest/:contestId", scoreContest);

export default router;  