import {
  getContestsService,
  joinContestService,
  getAllContestsService,
  getMyContestsService,
  getLeaderboardService,
  getMyRankService,
  getScoreBreakdownService,
  getContestWinningsService,   // ← NEW
} from "./contest.service.js";

export const getAllContests = async (req, res) => {
  try {
    const contests = await getAllContestsService();
    res.status(200).json({ success: true, total: contests.length, data: contests });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getContestsByMatchId = async (req, res) => {
  try {
    const userId   = req.user?.id;
    const match_id = req.params.match_id?.trim();

    if (!userId)   return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!match_id) return res.status(400).json({ success: false, message: "match_id param is required" });

    const contests = await getContestsService(match_id, userId);

    if (!contests || contests.length === 0)
      return res.status(404).json({ success: false, message: "No contests found for this match" });

    return res.status(200).json({ success: true, total: contests.length, data: contests });

  } catch (err) {
    console.error("[getContestsByMatchId]", err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Internal server error",
    });
  }
};

export const joinContest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { contestId, userTeamId, entryFee } = req.body;

    const response = await joinContestService(userId, entryFee, {
      contestId,
      userTeamId,
      ip:     req.ip,
      device: req.headers["user-agent"],
    });

    res.status(200).json(response);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getMyContests = async (req, res) => {
  try {
    const userId   = req.user?.id;
    const match_id = req.params.match_id?.trim();

    if (!userId)   return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!match_id) return res.status(400).json({ success: false, message: "match_id param is required" });

    const contests = await getMyContestsService(userId, match_id);

    if (!contests || contests.length === 0)
      return res.status(404).json({ success: false, message: "No contests found" });

    return res.status(200).json({ success: true, total: contests.length, data: contests });

  } catch (err) {
    console.error("[getMyContests]", err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Internal server error",
    });
  }
};

// ─────────────────────────────────────────────────────
// GET /api/contests/leaderboard/:contest_id
// FIX: pass userId so "my_entry" card works at top
// ─────────────────────────────────────────────────────
export const getLeaderboard = async (req, res) => {
  try {
    const { contest_id }        = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId                = req.user?.id;   // ← pass authenticated user

    if (!contest_id)
      return res.status(400).json({ success: false, message: "contest_id required" });

    const result = await getLeaderboardService(
      contest_id,
      userId,                 // ← NEW: was missing before
      parseInt(page),
      parseInt(limit)
    );
    res.json(result);
  } catch (err) {
    console.error("getLeaderboard error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getMyRank = async (req, res) => {
  try {
    const { contest_id, teamId } = req.params;
    const user_id = req.user.id;

    if (!contest_id || !teamId)
      return res.status(400).json({ success: false, message: "contest_id and teamId required" });

    const result = await getMyRankService(contest_id, user_id, teamId);
    res.json(result);
  } catch (err) {
    console.error("getMyRank error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────
// GET /api/contests/breakdown/:contestId/:userTeamId?matchId=xxx
// ─────────────────────────────────────────────────────
export const getScoreBreakdown = async (req, res) => {
  try {
    const { contestId, userTeamId } = req.params;
    const { matchId }               = req.query;

    if (!contestId || !userTeamId || !matchId)
      return res.status(400).json({
        success: false,
        message: "contestId, userTeamId (params) and matchId (query) are required",
      });

    const result = await getScoreBreakdownService(contestId, userTeamId, matchId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[getScoreBreakdown]", err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Internal server error",
    });
  }
};

// ─────────────────────────────────────────────────────
// GET /api/contests/winnings/:contest_id
// NEW: Powers the "Winnings" tab — prize pool breakdown
// ─────────────────────────────────────────────────────
export const getContestWinnings = async (req, res) => {
  try {
    const { contest_id } = req.params;

    if (!contest_id)
      return res.status(400).json({ success: false, message: "contest_id required" });

    const result = await getContestWinningsService(contest_id);
    res.json(result);
  } catch (err) {
    console.error("[getContestWinnings]", err.message);
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};