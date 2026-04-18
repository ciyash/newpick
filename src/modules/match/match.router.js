import express from "express";

import { getAllMatches, getJoinedMatches, getMatchesByType, getMatchFullDetails, getPastMatches } from "./match.controller.js";

const router = express.Router();

router.get('/past', getPastMatches);

router.get("/joined-matches", getJoinedMatches)

router.get("/all", getAllMatches);

router.get("/:id", getMatchFullDetails);



router.get("/matches/:type", getMatchesByType);
  


export default router    
    

