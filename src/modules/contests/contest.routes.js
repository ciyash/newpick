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

// // user contest
// router.post("/join",  joinContest);
  
// router.get("/my-contests/:match_id",  getMyContests);


// // admin get contestss

// router.get("/", getAllContests);

// router.get("/:match_id",  getContestsByMatchId);

// router.get("/leaderboard/:contest_id", getLeaderboard);

// router.get("/my-rank/:contest_id/:teamId", getMyRank); 

// router.get("/breakdown/:contestId/:userTeamId", getScoreBreakdown);



router.post("/join",                            joinContest);
router.get("/my-contests/:match_id",            getMyContests);
router.get("/leaderboard/:contest_id",          getLeaderboard);        // ✅ moved up
router.get("/my-rank/:contest_id/:teamId",      getMyRank);             // ✅ moved up
router.get("/breakdown/:contestId/:userTeamId", getScoreBreakdown);     // ✅ moved up
router.get("/",                                 getAllContests);
router.get("/:match_id",                        getContestsByMatchId);  // ✅ last
  
export default router;   
     



   