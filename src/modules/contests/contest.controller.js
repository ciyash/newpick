
import db from "../../config/db.js";
import express from "express";
import {
  getAllContestsService,
  getContestsService,
  getFantasyDashboardService,
  joinContestService,
  getMyContestsService,
  getLeaderboardService,
  getMyRankService,
  getScoreBreakdownService,
  compareTeamService,
  getContestHistoryService,
  announceWinnersService,
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
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Internal server error",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/contests/join contsj
// Body: { contestId, userTeamId, entryFee }
// userTeamId can be a single ID or an array of IDs (multi-team join)
// ─────────────────────────────────────────────────────────────────────────────


export const joinContest = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { contestId, userTeamId } = req.body;  

    if (!userId)    return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!contestId) return res.status(400).json({ success: false, message: "contestId is required" });
    if (!userTeamId) return res.status(400).json({ success: false, message: "userTeamId is required" });

    const result = await joinContestService(userId, { 
      contestId,
      userTeamId,
      ip:     req.ip,
      device: req.headers["user-agent"],
    });

    return res.status(200).json(result);
  } catch (err) {
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

  return res.status(err.statusCode || 500).json({
    success: false,
    message: err.message  
  });
}
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contests/dashboard/:match_id
// Aggregated payload for fantasy page (contests + my-contests + my-teams)
// ─────────────────────────────────────────────────────────────────────────────
export const getFantasyDashboard = async (req, res) => {
  try {
    const userId = req.user?.id;
    const match_id = req.params.match_id?.trim();

    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!match_id) return res.status(400).json({ success: false, message: "match_id is required" });

    const result = await getFantasyDashboardService(userId, match_id);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};



// Controller
export const compareTeam = async (req, res) => {
  try {
    const { contest_id }               = req.params;
    const { my_team_id, opp_team_id }  = req.body;   
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
  
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Internal server error",
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/contests/history
// Query: ?year=2026&month=4&status=COMPLETED&page=1&limit=10
// ─────────────────────────────────────────────────────────────────────────────


export const getContestHistory = async (req, res) => {
  try {
    const userId = req.user?.id;
    const { year, month, page = 1, limit = 10 } = req.query; 

    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const result = await getContestHistoryService(userId, {
      year:  year  ? parseInt(year)  : null,
      month: month ? parseInt(month) : null,
      page:  parseInt(page),
      limit: parseInt(limit),
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// ── GET /admin/contests/in-review ──
export const getInReviewContests = async (req, res) => {
  try {
    const [contests] = await db.query(
      `SELECT
         c.id, c.match_id, c.contest_type, c.entry_fee,
         c.prize_pool, c.current_entries, c.status,
         m.hometeamname, m.awayteamname, m.matchdate
       FROM contest c
       JOIN matches m ON m.id = c.match_id
       WHERE c.status = 'INREVIEW'
       ORDER BY c.id DESC`
    );

    return res.status(200).json({
      success: true,
      total:   contests.length,
      data:    contests,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Credit Winnings to Wallets ──


const creditWinningsToWallets = async (contestId, conn) => {
  const [winners] = await conn.query(
    `SELECT user_id, SUM(winning_amount) AS total_winning
     FROM contest_entries
     WHERE contest_id = ? AND winning_amount > 0
     GROUP BY user_id`,
    [contestId]
  );

  if (!winners.length) return 0;

  for (const winner of winners) {
    // ── 1. Current balance fetch ──
    const [[wallet]] = await conn.query(
      `SELECT earnwallet FROM wallets WHERE user_id = ?`,
      [winner.user_id]
    );
    if (!wallet) continue;

    const openingBalance = parseFloat(wallet.earnwallet) || 0;
    const closingBalance = openingBalance + parseFloat(winner.total_winning);

    // ── 2. earnwallet update ──
    await conn.query(
      `UPDATE wallets
       SET earnwallet = earnwallet + ?
       WHERE user_id = ?`,
      [winner.total_winning, winner.user_id]
    );

    // ── 3. wallet_transactions record ──
    await conn.query(
     `INSERT INTO wallet_transactions
   (user_id, wallettype, transtype, remark, amount,
    opening_balance, closing_balance, reference_id)
 VALUES (?, 'winning', 'credit', ?, ?, ?, ?, ?)`,
      [
        winner.user_id,
        `Contest #${contestId} winning`,
        winner.total_winning,
        openingBalance,
        closingBalance,
        `CONTEST_${contestId}`,
      ]
    );
  }

  return winners.length;
};

// ── POST /admin/contests/:contestId/approve ──
export const approveContestResults = async (req, res) => {
  const { contestId } = req.params;
  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // ── Validate contest ──
    const [[contest]] = await conn.query(
      `SELECT id, status FROM contest WHERE id = ? FOR UPDATE`,
      [contestId]
    );

    if (!contest)
      return res.status(404).json({ success: false, message: "Contest not found" });

    if (contest.status !== "INREVIEW")
      return res.status(400).json({
        success: false,
        message: `Contest is '${contest.status}', only INREVIEW contests can be approved`,
      });

    // ── Credit winnings ──
    const winnersCount = await creditWinningsToWallets(contestId, conn);

    // ── COMPLETED గా mark  ──
    await conn.query(
      `UPDATE contest SET status = 'COMPLETED' WHERE id = ?`,
      [contestId]
    );

    await conn.commit();

    return res.status(200).json({
      success:      true,
      message:      `Contest #${contestId} approved successfully`,
      contestId:    parseInt(contestId),
      winnersCount,
    });

  } catch (err) {
    if (conn) await conn.rollback();
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    if (conn) conn.release();
  }
};

// controllers/admin/contestController.js

export const announceWinners = async (req, res) => {
  try {
    const { contestId } = req.params;
    const adminId = req.admin?.id;

    if (!contestId)
      return res.status(400).json({ success: false, message: "contestId is required" });

    const result = await announceWinnersService(Number(contestId), adminId);
    return res.status(200).json(result);

  } catch (err) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
    });
  }
};
