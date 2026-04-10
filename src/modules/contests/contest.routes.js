 
     
import express from "express";
import {
  getAllContests,
  getContestsByMatchId,
  getLeaderboard,
  getMyContests,
  getMyRank,
  getScoreBreakdown,
  joinContest,
  getContestWinnings,    
} from "./contest.controller.js";

const router = express.Router();

// ── Mutation ──────────────────────────────────────────
router.post("/join",                               joinContest);

// ── Authenticated user's contests ────────────────────
router.get("/my-contests/:match_id",               getMyContests);

// ── Leaderboard + Winnings (two tabs in the UI) ──────
router.get("/leaderboard/:contest_id",             getLeaderboard);   // Leaderboard tab
router.get("/winnings/:contest_id",                getContestWinnings); // Winnings tab  ← NEW

// ── Rank / Score ──────────────────────────────────────
router.get("/my-rank/:contest_id/:teamId",         getMyRank);  // Get user's rank and score in the contest
router.get("/breakdown/:contestId/:userTeamId",    getScoreBreakdown);

// ── General (keep these LAST — broad patterns) ───────
router.get("/",                                    getAllContests);
router.get("/:match_id",                           getContestsByMatchId);

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

