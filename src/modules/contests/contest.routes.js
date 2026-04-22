
import db from "../../config/db.js";

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
import { scoreContestService } from "../scoring/scoring.service.js";

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

router.get("/test/score/:contestId/:matchId", async (req, res) => {
  try {
    const { contestId, matchId } = req.params;
    
    // Force status reset చేయి
    await db.query(
      `UPDATE contest SET status = 'LIVE' WHERE id = ?`,
      [contestId]
    );
    await db.query(
      `UPDATE contest_entries SET status = 'active', urank = NULL, winning_amount = NULL 
       WHERE contest_id = ?`,
      [contestId]
    );
    
    const result = await scoreContestService(contestId, matchId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


export default router;  