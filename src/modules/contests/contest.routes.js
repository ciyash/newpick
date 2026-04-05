import express from "express";
import {
  getAllContests,
  getContestsByMatchId,
  getLeaderboard,
  getMyContests,
  getMyRank,
  joinContest   
} from "./contest.controller.js";



const router = express.Router();  

// user contest
router.post("/join",  joinContest);

router.get("/my-contests/:match_id",  getMyContests);


// admin get contestss

router.get("/", getAllContests);

router.get("/:match_id",  getContestsByMatchId);

router.get("/leaderboard/:contest_id", getLeaderboard);

// router.get("/my-rank/:contest_id",  getMyRank);   

router.get("/my-rank/:contest_id/:team_id", getMyRank); 
  
export default router;   
   

   