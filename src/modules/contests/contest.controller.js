import {
  getAllContestsService,
  getContestsService,
  joinContestService,
  getMyContestsService,
  getLeaderboardService,
  getMyRankService,
  getScoreBreakdownService,
  getContestWinningsService,
  compareTeamService,
} from "./contest.service.js";

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contests
// All contests (admin / debug)
// ─────────────────────────────────────────────────────────────────────────────
export const getAllContests = async (req, res) => {
  try {
    const contests = await getAllContestsService();
    return res.status(200).json({ success: true, total: contests.length, data: contests });
  } catch (err) {
    console.error("[getAllContests]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contests/:match_id
// Contests for a match — includes user's join status
// ─────────────────────────────────────────────────────────────────────────────
export const getContestsByMatchId = async (req, res) => {
  try {
    const userId   = req.user?.id;
    const match_id = req.params.match_id?.trim();

    if (!userId)   return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!match_id) return res.status(400).json({ success: false, message: "match_id is required" });

    const contests = await getContestsService(match_id, userId);

    if (!contests?.length)
      return res.status(404).json({ success: false, message: "No contests found for this match" });

    return res.status(200).json({ success: true, total: contests.length, data: contests });
  } catch (err) {
    console.error("[getContestsByMatchId]", err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Internal server error",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/contests/join
// Body: { contestId, userTeamId, entryFee }
// userTeamId can be a single ID or an array of IDs (multi-team join)
// ─────────────────────────────────────────────────────────────────────────────
export const joinContest = async (req, res) => {
  try {
    const userId                        = req.user?.id;
    const { contestId, userTeamId, entryFee } = req.body;

    if (!userId)     return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!contestId)  return res.status(400).json({ success: false, message: "contestId is required" });
    if (!userTeamId) return res.status(400).json({ success: false, message: "userTeamId is required" });

    const result = await joinContestService(userId, entryFee ?? 0, {
      contestId,
      userTeamId,
      ip:     req.ip,
      device: req.headers["user-agent"],
    });

    return res.status(200).json(result);
  } catch (err) {
    console.error("[joinContest]", err.message);
    return res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contests/my-contests/:match_id
// Contests this user has joined for a specific match
// ─────────────────────────────────────────────────────────────────────────────
export const getMyContests = async (req, res) => {
  try {
    const userId   = req.user?.id;
    const match_id = req.params.match_id?.trim();

    if (!userId)   return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!match_id) return res.status(400).json({ success: false, message: "match_id is required" });

    const contests = await getMyContestsService(userId, match_id);

    if (!contests?.length)
      return res.status(404).json({ success: false, message: "No contests found" });

    return res.status(200).json({ success: true, total: contests.length, data: contests });
  } 
  
  catch (err) {
  console.error("ERROR:", err.message); // ← add this line
  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message  // now shows real error in response too
  });
}
};



// Controller
export const compareTeam = async (req, res) => {
  try {
    const { contest_id }               = req.params;
    const { my_team_id, opp_team_id }  = req.body;   // ✅ req.body
    const userId                       = req.user?.id;

    if (!contest_id || !my_team_id || !opp_team_id)
      return res.status(400).json({
        success: false,
        message: "contest_id, my_team_id and opp_team_id are required",
      });

    const result = await compareTeamService(
      contest_id,
      parseInt(my_team_id),
      parseInt(opp_team_id),
      userId
    );

    if (!result.success)
      return res.status(404).json(result);

    return res.status(200).json(result);
  } catch (err) {
    console.error("[compareTeam]", err.message);
    return res.status(500).json({ success: false, message:err.message });
  }
};
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contests/leaderboard/:contest_id?page=1&limit=50
// Full leaderboard + my_entry pinned card
// ─────────────────────────────────────────────────────────────────────────────
export const getLeaderboard = async (req, res) => {
  try {
    const { contest_id }           = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId                   = req.user?.id;

    if (!contest_id)
      return res.status(400).json({ success: false, message: "contest_id is required" });

    const result = await getLeaderboardService(
      contest_id,
      userId,
      parseInt(page),
      parseInt(limit)
    );

    if (!result.success)
      return res.status(404).json(result);

    return res.status(200).json(result);
  } catch (err) {
    console.error("[getLeaderboard]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contests/my-rank/:contest_id/:teamId
// Current rank + points for a specific user team in a contest
// ─────────────────────────────────────────────────────────────────────────────
export const getMyRank = async (req, res) => {
  try {
    const { contest_id, teamId } = req.params;
    const userId                 = req.user?.id;

    if (!userId)     return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!contest_id) return res.status(400).json({ success: false, message: "contest_id is required" });
    if (!teamId)     return res.status(400).json({ success: false, message: "teamId is required" });

    const result = await getMyRankService(contest_id, userId, teamId);

    if (!result.success)
      return res.status(404).json(result);

    return res.status(200).json(result);
  } catch (err) {
    console.error("[getMyRank]", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contests/breakdown/:contestId/:userTeamId?matchId=xxx
// Per-player fantasy points breakdown for a user's team
// ─────────────────────────────────────────────────────────────────────────────
export const getScoreBreakdown = async (req, res) => {
  try {
    const { contestId, userTeamId } = req.params;
    const { matchId }               = req.query;

    if (!contestId || !userTeamId || !matchId)
      return res.status(400).json({
        success: false,
        message: "contestId, userTeamId (params) and matchId (query) are all required",
      });

    const result = await getScoreBreakdownService(contestId, userTeamId, matchId);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[getScoreBreakdown]", err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Internal server error",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contests/winnings/:contest_id
// Prize pool breakdown — powers the "Winnings" tab
// Returns bonus tiers + refund zone + no-prize zone for the frontend
// ─────────────────────────────────────────────────────────────────────────────
export const getContestWinnings = async (req, res) => {
  try {
    const { contest_id } = req.params;

    if (!contest_id)
      return res.status(400).json({ success: false, message: "contest_id is required" });

    const result = await getContestWinningsService(contest_id);
    return res.status(200).json(result);
  } catch (err) {
    console.error("[getContestWinnings]", err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Internal server error",
    });
  }
};