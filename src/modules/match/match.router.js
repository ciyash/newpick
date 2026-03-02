import express from "express";

import { getAllMatches, getMatchesByType, getMatchFullDetails } from "./match.controller.js";



const router = express.Router();

router.get("/all", getAllMatches);

router.get("/:id", getMatchFullDetails);

router.get("/matches/:type", getMatchesByType);

export default router  
 