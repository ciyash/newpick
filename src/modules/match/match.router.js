import express from "express";

import { getAllMatches,  getMatches,  getMatchFullDetails } from "./match.controller.js";

const router = express.Router();



router.get("/all", getAllMatches);

router.get('/:status', getMatches);

router.get("/:id", getMatchFullDetails);




  


export default router    
    

   