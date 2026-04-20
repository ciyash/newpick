import express from "express";
import {
  getAllContests,
  getContestsByMatchId,
  getLeaderboard,
  getMyContests,
  getMyRank,
  getScoreBreakdown,
  joinContest,
  compareTeam,
  getContestHistory,
} from "./contest.controller.js";

const router = express.Router();

// ── Mutation ──────────────────────────────────────────────────────────────────
router.post("/join",                              joinContest);

// ── Authenticated user's contests ────────────────────────────────────────────
router.get("/my-contests/:match_id",              getMyContests);

// ── Leaderboard + Winnings (two tabs in the UI) ───────────────────────────────
router.get("/leaderboard/:contest_id",            getLeaderboard);    // Leaderboard tab


router.post("/leaderboard/compare/:contest_id",    compareTeam);

// ── Rank / Score breakdown ────────────────────────────────────────────────────
router.get("/my-rank/:contest_id/:teamId",        getMyRank);

router.get("/breakdown/:contestId/:userTeamId",   getScoreBreakdown);  

// ── General (keep LAST — broad patterns must not shadow specific routes) ──────
router.get("/",                                   getAllContests);
// Contest history
router.get("/history", getContestHistory);
router.get("/:match_id",                          getContestsByMatchId);


export default router;