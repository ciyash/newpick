import * as s from "./admin.service.js";
import { getClientIp } from "../../utils/ip.js";

// ERROR HELPER 

const handleError = (res, error) => {
  console.error(error);

  const msg  = error?.message || "Internal server error";
  const code = error?.code    || "";

  
  if (msg.includes("already exists") || code === "ER_DUP_ENTRY") {
    return res.status(409).json({ success: false, message: msg });
  }

  
  if (
    msg.includes("required")          ||
    msg.includes("Invalid")           ||
    msg.includes("invalid")           ||
    msg.includes("No data to update")
  ) {
    return res.status(400).json({ success: false, message: msg });
  }

  
  if (
    msg.includes("not found")  ||
    msg.includes("No deposits")||
    msg.includes("No withdraws")||
    msg.includes("No users")   ||
    msg.includes("No matches") ||
    msg.includes("No contests")||
    msg.includes("No players") ||
    msg.includes("No series")
  ) {
    return res.status(404).json({ success: false, message: msg });
  }

  
  return res.status(500).json({ success: false, message: msg });
};

// ADMIN

export const createAdmin = async (req, res) => {
  try {
    const data = await s.createAdmin(req.body, req.admin, getClientIp(req));
    res.status(201).json({ success: true, message: "Admin created successfully", data });
  } catch (e) {
    handleError(res, e);                                    
  }
};

export const getAdmins = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await s.getAdmins({ page, limit });
    res.json({ success: true, ...result });
  } catch (e) {
    handleError(res, e);
  }
};

export const getAdminById = async (req, res) => {
  try {
    const data = await s.getAdminById(req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const updateAdmin = async (req, res) => {
  try {
    const result = await s.updateAdmin(req.params.id, req.body, req.admin, getClientIp(req));
    res.json(result); // { success: true, id: ..., message: ... }
  } catch (e) {
    handleError(res, e);
  }
};

// SERIES 

export const createSeries = async (req, res) => {
  try {
    const data = await s.createSeries(req.body, req.admin, getClientIp(req));
    res.status(201).json({
      success: true,
      message: "Series created successfully",
      data
    });
  } catch (e) {
    handleError(res, e);
  }
};

export const getSeries = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // max 100

    const data = await s.getSeries({ page, limit });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};
export const getSeriesById = async (req, res) => {
  try {
    const data = await s.getSeriesById(req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};
export const updateSeries = async (req, res) => {
  try {
    await s.updateSeries(req.params.id, req.body, req.admin, getClientIp(req));
    res.json({ success: true, message: "Series updated successfully" });
  } catch (e) {
    handleError(res, e);
  }
};

// MATCH 

export const createMatch = async (req, res) => {
  try {
    const data = await s.createMatch(req.body, req.admin, getClientIp(req));
    res.status(201).json({ success: true, message: "Match created successfully", data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getMatches = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const status = req.query.status || null;

    const data = await s.getMatches({ page, limit, status });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getMatchById = async (req, res) => {
  try {
    const data = await s.getMatchById(req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getMatchBySeries = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const status = req.query.status || null;

    const data = await s.getMatchBySeries(req.params.id, { page, limit, status });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const updateMatch = async (req, res) => {
  try {
    await s.updateMatch(req.params.id, req.body, req.admin, getClientIp(req));
    res.json({ success: true, message: "Match updated successfully" });
  } catch (e) {
    handleError(res, e);
  }
};

// TEAM 

export const createTeam = async (req, res) => {
  try {
    const data = await s.createTeam(req.body, req.admin, getClientIp(req));
    res.status(201).json({ success: true, message: "Team created successfully", data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getTeams = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const data = await s.getTeams({ page, limit });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getTeamById = async (req, res) => {
  try {
    const data = await s.getTeamById(req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const updateTeam = async (req, res) => {
  try {
    await s.updateTeam(req.params.id, req.body, req.admin, getClientIp(req));
    res.json({ success: true, message: "Team updated successfully" });
  } catch (e) {
    handleError(res, e);
  }
};
// PLAYER 

export const createPlayer = async (req, res) => {
  try {
    const data = await s.createPlayer(req.body, req.admin, getClientIp(req));
    res.status(201).json({ success: true, message: "Player created successfully", data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getPlayers = async (req, res) => {
  try {
    const page     = parseInt(req.query.page)           || 1;
    const limit    = Math.min(parseInt(req.query.limit) || 20, 100);
    const position = req.query.position                 || null;

    const data = await s.getPlayers({ page, limit, position });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getPlayerById = async (req, res) => {
  try {
    const data = await s.getPlayerById(req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getPlayerByTeam = async (req, res) => {
  try {
    const page     = parseInt(req.query.page)           || 1;
    const limit    = Math.min(parseInt(req.query.limit) || 20, 100);
    const position = req.query.position                 || null;

    const data = await s.getPlayerByTeam(req.params.id, { page, limit, position });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};


export const updatePlayer = async (req, res) => {
  try {
    await s.updatePlayer(req.params.id, req.body, req.admin, getClientIp(req));
    res.json({ success: true, message: "Player updated successfully" });
  } catch (e) {
    handleError(res, e);
  }
};

// CONTEST 

export const createContest = async (req, res) => {
  try {
    const data = await s.createContest(req.body, req.admin, getClientIp(req));
    res.status(201).json({ success: true, message: "Contest created successfully", data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getContests = async (req, res) => {
  try {
    const page   = parseInt(req.query.page)           || 1;
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const status = req.query.status                   || null;

    const data = await s.getContests({ page, limit, status });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getContestById = async (req, res) => {
  try {
    const data = await s.getContestById(req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getContestsByMatch = async (req, res) => {
  try {
    const page   = parseInt(req.query.page)           || 1;
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const status = req.query.status                   || null;

    const data = await s.getContestsByMatch(req.params.matchId, { page, limit, status });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getContestsBySeries = async (req, res) => {
  try {
    const page   = parseInt(req.query.page)           || 1;
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const status = req.query.status                   || null;

    const data = await s.getContestsBySeries(req.params.seriesId, { page, limit, status });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getContestsByStatus = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const data = await s.getContestsByStatus(req.params.status, { page, limit });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getContestsByTeam = async (req, res) => {
  try {
    const page   = parseInt(req.query.page)           || 1;
    const limit  = Math.min(parseInt(req.query.limit) || 20, 100);
    const status = req.query.status                   || null;

    const data = await s.getContestsByTeam(req.params.teamId, { page, limit, status });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const updateContest = async (req, res) => {
  try {
    await s.updateContest(req.params.id, req.body, req.admin, getClientIp(req));
    res.json({ success: true, message: "Contest updated successfully" });
  } catch (e) {
    handleError(res, e);
  }
};


//CONTEST CATEGORY 

export const createContestCategory = async (req, res) => {
  try {
    const data = await s.createContestCategory(req.body, req.admin, getClientIp(req));
    res.status(201).json({ success: true, message: "Contest category created successfully", data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getContestCategories = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const data = await s.getContestCategories({ page, limit });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const updateContestCategory = async (req, res) => {
  try {
    await s.updateContestCategory(req.params.id, req.body, req.admin, getClientIp(req));
    res.json({ success: true, message: "Contest category updated successfully" });
  } catch (e) {
    handleError(res, e);
  }
};


// ── Dashboard ─────────────────────────────────────────────────
export const getHome = async (req, res) => {
  try {
    const data = await s.getHomeservice();
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};


// ── Deposits ──────────────────────────────────────────────────
export const getallDeposites = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const data = await s.getallDeposites({ page, limit });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const fetchDeposites = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const data = await s.fetchDeposites(req.query, { page, limit });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const fetchDepositesSummary = async (req, res) => {
  try {
    const data = await s.fetchDepositesSummary();
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};


// ── Withdraws ─────────────────────────────────────────────────
export const getallWithdraws = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const data = await s.getallWithdraws({ page, limit });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const fetchWithdraws = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const data = await s.fetchWithdraws(req.query, { page, limit });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const fetchWithdrawsSummary = async (req, res) => {
  try {
    const data = await s.fetchWithdrawsSummary();
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};


// ── Users ─────────────────────────────────────────────────────
export const getallUsers = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const data = await s.getallUsers({ page, limit });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const fetchUsers = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const data = await s.fetchUsers(req.query, { page, limit });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const fetchUsersByKycStatus = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const data = await s.fetchUsersByKycStatus(req.query, { page, limit });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};

export const fetchUsersByAccountStatus = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)           || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    const data = await s.fetchUsersByAccountStatus(req.query, { page, limit });
    res.json({ success: true, ...data });
  } catch (e) {
    handleError(res, e);
  }
};
