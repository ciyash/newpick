
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
  getContestHistoryService,
  announceWinnersService,
  cancelContestService,
  getCompletedMatchLeaderboardService,
  
} from "./contest.service.js";


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


// Current rank + points for a specific user team in a contest

  
export const getMyRank = async (req, res) => {
  try {
    const { contest_id } = req.params;
    const userId         = req.user?.id;

    if (!userId)     return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!contest_id) return res.status(400).json({ success: false, message: "contest_id is required" });

    const result = await getMyRankService(contest_id, userId);

    if (!result.success)
      return res.status(404).json(result);

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Per-player fantasy points breakdown for a user's team

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

// Query: ?year=2026&month=4&status=COMPLETED&page=1&limit=10



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

  // ── Contest + match details ──
  const [[contest]] = await conn.query(
    `SELECT c.id, c.prize_pool, c.net_pool_prize, c.contest_type,
            m.hometeamname, m.awayteamname
     FROM contest c
     JOIN matches m ON m.id = c.match_id
     WHERE c.id = ?`,
    [contestId]
  );
  if (!contest) return 0;

  const matchInfo   = `${contest.hometeamname} vs ${contest.awayteamname}`;
  const platformFee = parseFloat(
    (Number(contest.prize_pool) - Number(contest.net_pool_prize)).toFixed(2)
  ) || 0;

  // ── Company balance ──
  const [[companyLastRow]] = await conn.query(
    `SELECT closing_balance FROM wallet_transactions
     WHERE closing_balance IS NOT NULL
     ORDER BY id DESC LIMIT 1 FOR UPDATE`
  );
  let companyBalance = Number(companyLastRow?.closing_balance || 0);

  for (const winner of winners) {

    // ── 1. Wallet fetch ──
    const [[wallet]] = await conn.query(
      `SELECT earnwallet, depositwallet, bonusamount
       FROM wallets
       WHERE user_id = ? FOR UPDATE`,
      [winner.user_id]
    );
    if (!wallet) continue;

    const totalBal       = Number(wallet.earnwallet) + Number(wallet.depositwallet) + Number(wallet.bonusamount);
    const openingBalance = parseFloat(totalBal.toFixed(2));
    const closingBalance = parseFloat((totalBal + parseFloat(winner.total_winning)).toFixed(2));

    const coOpen   = companyBalance;
    const coClose  = Number((companyBalance - parseFloat(winner.total_winning)).toFixed(2));
    companyBalance = coClose;

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
          useropeningbalance, userclosingbalance,
          opening_balance, closing_balance, reference_id)
       VALUES (?, 'winning', 'credit', ?, ?, ?, ?, ?, ?, ?)`,
      [
        winner.user_id,
        `${contest.contest_type} winning — ${matchInfo}`,
        winner.total_winning,
        openingBalance,
        closingBalance,
        coOpen,
        coClose,
        `CONTEST_${contestId}`,
      ]
    );

    // ── 4. financial_transactions — User winning ──
    await conn.query(
      `INSERT INTO financial_transactions
         (user_id, entity_type, wallet_type, transaction_type,
          amount, opening_balance, closing_balance,
          reference_table, reference_id, remark, status, created_at)
       VALUES (?, 'user', 'game_wallet', 'credit', ?, ?, ?, 'contest', ?, ?, 'success', NOW(6))`,
      [
        winner.user_id,
        winner.total_winning,
        openingBalance,
        closingBalance,
        contestId,
        `${contest.contest_type} winning — ${matchInfo}`,
      ]
    );
  }

  // ── 5. financial_transactions — Company platform fee ──
  if (platformFee > 0) {
    const [[lastFt]] = await conn.query(
      `SELECT closing_balance FROM financial_transactions
       WHERE entity_type = 'system'
       ORDER BY created_at DESC LIMIT 1`
    );
    const companyOpen  = Number(lastFt?.closing_balance || 0);
    const companyClose = parseFloat((companyOpen + platformFee).toFixed(2));

    await conn.query(
      `INSERT INTO financial_transactions
         (entity_type, wallet_type, transaction_type,
          amount, opening_balance, closing_balance,
          reference_table, reference_id, remark, status, created_at)
       VALUES ('system', 'admin_wallet', 'credit', ?, ?, ?, 'contest', ?, ?, 'success', NOW(6))`,
      [
        platformFee,
        companyOpen,
        companyClose,
        contestId,
        "platform fee",
      ]
    );
  }

  return winners.length;
};

// ── POST /admin/contests/approve ──
export const approveContestResults = async (req, res) => {
  const { contestIds } = req.body;
  let conn;

  try {
    // ── Validate input ──
    if (!contestIds || !Array.isArray(contestIds) || contestIds.length === 0)
      return res.status(400).json({
        success: false,
        message: "contestIds array is required",
      });

    conn = await db.getConnection();
    await conn.beginTransaction();

    const results = [];

    for (const contestId of contestIds) {
      // ── Validate contest ──
      const [[contest]] = await conn.query(
        `SELECT id, status FROM contest WHERE id = ? FOR UPDATE`,
        [contestId]
      );

      if (!contest) {
        results.push({ contestId, success: false, message: "Contest not found" });
        continue;
      }

      if (contest.status !== "INREVIEW") {
        results.push({
          contestId,
          success: false,
          message: `Contest is '${contest.status}', only INREVIEW contests can be approved`,
        });
        continue;
      }

      // ── Credit winnings ──
      const winnersCount = await creditWinningsToWallets(contestId, conn);

      // ── COMPLETED గా mark ──
      await conn.query(
        `UPDATE contest SET status = 'COMPLETED' WHERE id = ?`,
        [contestId]
      );

      results.push({ contestId, success: true, winnersCount });
    }

    await conn.commit();

    return res.status(200).json({
      success: true,
      message: `${results.filter(r => r.success).length} contest(s) approved successfully`,
      results,
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


// admin.controller.js 
export const cancelContest = async (req, res) => {
  try {
    const { contestId } = req.params;
    const result = await cancelContestService(contestId);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};



// export const getCompletedLeaderboard = async (req, res) => {
//   try {
//     const { contestId } = req.params;
//     const userId = req.user?.id;
//     const page   = parseInt(req.query.page)  || 1;
//     const limit  = parseInt(req.query.limit) || 50;

//     const result = await getCompletedLeaderboardService(
//       contestId, userId, page, limit
//     );

//     if (!result.success)
//       return res.status(400).json(result);

//     return res.status(200).json(result);
//   } catch (err) {
//     return res.status(500).json({ success: false, message: err.message });
//   }
// };


export const getCompletedMatchLeaderboard = async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user?.id;
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 50;

    const result = await getCompletedMatchLeaderboardService(
      matchId, userId, page, limit
    );

    if (!result.success)
      return res.status(400).json(result);

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

   