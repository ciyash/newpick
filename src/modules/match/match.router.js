import express from "express";

import { getAllMatches, getMatchesByType, getMatchFullDetails, getPastMatches } from "./match.controller.js";

const router = express.Router();

router.get('/past', getPastMatches);

router.get("/all", getAllMatches);

router.get("/:id", getMatchFullDetails);

router.get("/matches/:type", getMatchesByType);
  


export default router    
    

