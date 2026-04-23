

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
  getInReviewContests,
  approveContestResults,
  announceWinners,
} from "./contest.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";


const router = express.Router();

// ── Mutation ──────────────────────────────────────────────────────────────────
router.post("/join", authenticate, checkAccountActive, joinContest);

// ── Authenticated user's contests ────────────────────────────────────────────
router.get("/my-contests/:match_id", authenticate, checkAccountActive, getMyContests);

// ── Leaderboard + Winnings (two tabs in the UI) ───────────────────────────────
router.get("/leaderboard/:contest_id", authenticate, checkAccountActive, getLeaderboard);    // Leaderboard tab


router.post("/leaderboard/compare/:contest_id", authenticate, checkAccountActive, compareTeam);

// ── Rank / Score breakdown ────────────────────────────────────────────────────
router.get("/my-rank/:contest_id/:teamId", authenticate, checkAccountActive, getMyRank);

router.get("/breakdown/:contestId/:userTeamId", authenticate, checkAccountActive, getScoreBreakdown);

// ── General (keep LAST — broad patterns must not shadow specific routes) ──────
router.get("/", authenticate, checkAccountActive, getAllContests);
// Contest history
router.get("/history", authenticate, checkAccountActive, getContestHistory);

router.get("/:match_id", authenticate, checkAccountActive, getContestsByMatchId);


//admin routees accessible by admin only

router.get("/contests/in-review", adminAuth(), getInReviewContests);

router.post("/contests/approve/:contestId", adminAuth(), approveContestResults);

router.get("/contests/announce-winners/:contestId", adminAuth(), announceWinners);


export default router;  