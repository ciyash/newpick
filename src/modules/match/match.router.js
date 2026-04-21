import express from "express";

import { getAllMatches,  getMatches,  getMatchFullDetails } from "./match.controller.js";

const router = express.Router();


router.get("/:id", getMatchFullDetails);

router.get("/all", getAllMatches);

router.get('/:status', getMatches);



export default router    
      

   