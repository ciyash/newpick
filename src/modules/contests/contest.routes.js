import express from "express";
import {
  getAllContests,
  getContestsByMatchId,
  getLeaderboard,
  getMyContests,
  getMyRank,
  getScoreBreakdown,
  joinContest   
} from "./contest.controller.js";

const router = express.Router();  

router.post("/join",                            joinContest);
router.get("/my-contests/:match_id",            getMyContests);
router.get("/leaderboard/:contest_id",          getLeaderboard);        
router.get("/my-rank/:contest_id/:teamId",      getMyRank);            
router.get("/breakdown/:contestId/:userTeamId", getScoreBreakdown);     
router.get("/",                                 getAllContests);
router.get("/:match_id",                        getContestsByMatchId);  
  
export default router;   
     



   

// // user contest
// router.post("/join",  joinContest);
  
// router.get("/my-contests/:match_id",  getMyContests);


// // admin get contestss

// router.get("/", getAllContests);

// router.get("/:match_id",  getContestsByMatchId);

// router.get("/leaderboard/:contest_id", getLeaderboard);

// router.get("/my-rank/:contest_id/:teamId", getMyRank); 

// router.get("/breakdown/:contestId/:userTeamId", getScoreBreakdown);

