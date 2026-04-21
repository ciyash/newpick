import express from "express";

import { getAllMatches,  getMatches,  getMatchFullDetails } from "./match.controller.js";

const router = express.Router();

// ✅ Specific/static routes FIRST
router.get("/all", getAllMatches);

// ✅ Dynamic routes AFTER
router.get("/match-status/:status", getMatches);

router.get("/:id", getMatchFullDetails);






export default router    
      

   