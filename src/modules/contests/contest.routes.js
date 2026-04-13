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
  compareTeam,
} from "./contest.controller.js";

const router = express.Router();

// ── Mutation ──────────────────────────────────────────────────────────────────
router.post("/join",                              joinContest);

// ── Authenticated user's contests ────────────────────────────────────────────
router.get("/my-contests/:match_id",              getMyContests);

// ── Leaderboard + Winnings (two tabs in the UI) ───────────────────────────────
router.get("/leaderboard/:contest_id",            getLeaderboard);    // Leaderboard tab

router.post("/leaderboard/compare/:contest_id",    compareTeam);
router.get("/winnings/:contest_id",               getContestWinnings); // Winnings tab

// ── Rank / Score breakdown ────────────────────────────────────────────────────
router.get("/my-rank/:contest_id/:teamId",        getMyRank);
router.get("/breakdown/:contestId/:userTeamId",   getScoreBreakdown);  // ?matchId=xxx

// ── General (keep LAST — broad patterns must not shadow specific routes) ──────
router.get("/",                                   getAllContests);
router.get("/:match_id",                          getContestsByMatchId);

export default router;