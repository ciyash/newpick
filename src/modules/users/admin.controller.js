import * as s from "./admin.service.js";



/* ================= ERROR HELPER ================= */ 

const handleError = (res, error) => {
  console.error(error);

  const msg = error.message || "";

  if (msg.includes("already exists")) {
    return res.status(409).json({ success: false, message: msg });
  }

  if (
    msg.includes("not found") ||
    msg.includes("No contests")
  ) {
    return res.status(404).json({ success: false, message: msg });
  }

  return res.status(500).json({
    success: false,
    message: msg
  });
};

/* ================= ADMIN ================= */

export const createAdmin = async (req, res) => {
  try {
    const data = await s.createAdmin(req.body, req.admin, req.ip);

    return res.status(201).json({
      success: true,
      message: "Admin created successfully",
      data
    });
  } catch (error) {
    // Duplicate admin
    if (error.message === "Admin already exists") {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }

    // Unknown error
    console.error("Create admin error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};


export const getAdmins = async (req, res) => {
  try {
    const data = await s.getAdmins();
    res.json({ success: true, data });
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
    await s.updateAdmin(req.params.id, req.body, req.admin, req.ip);
    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
};

/* ================= SERIES ================= */

export const createSeries = async (req, res) => {
  try {
    const data = await s.createSeries(req.body, req.admin, req.ip);
    res.status(201).json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getSeries = async (req, res) => {
  try {
    const data = await s.getSeries();
    res.json({ success: true, data });
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
    await s.updateSeries(req.params.id, req.body, req.admin, req.ip);
    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
};

/* ================= MATCH ================= */

export const createMatch = async (req, res) => {
  try {
    const data = await s.createMatch(req.body, req.admin, req.ip);
    res.status(201).json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getMatches = async (req, res) => {
  try {
    const data = await s.getMatches();
    res.json({ success: true, data });
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
    const data = await s.getMatchBySeries(req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const updateMatch = async (req, res) => {
  try {
    await s.updateMatch(req.params.id, req.body, req.admin, req.ip);
    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
};

/* ================= TEAM ================= */

export const createTeam = async (req, res) => {
  try {
    const data = await s.createTeam(req.body, req.admin, req.ip);
    res.status(201).json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getTeams = async (req, res) => {
  try {
    const data = await s.getTeams();
    res.json({ success: true, data });
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
    await s.updateTeam(req.params.id, req.body, req.admin, req.ip);
    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
};

/* ================= PLAYER ================= */

export const createPlayer = async (req, res) => {
  try {
    const data = await s.createPlayer(req.body, req.admin, req.ip);
    res.status(201).json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getPlayers = async (req, res) => {
  try {
    const data = await s.getPlayers();
    res.json({ success: true, data });
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
    const data = await s.getPlayerByTeam(req.params.id);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const updatePlayer = async (req, res) => {
  try {
    await s.updatePlayer(req.params.id, req.body, req.admin, req.ip);
    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
};

/* ================= CONTEST ================= */

export const createContest = async (req, res) => {
  try {
    const data = await s.createContest(req.body);
    res.status(201).json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getContests = async (req, res) => {
  try {
    const data = await s.getContests();
    res.json({ success: true, data });
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

export const updateContest = async (req, res) => {
  try {
    await s.updateContest(req.params.id, req.body);
    res.json({ success: true });
  } catch (e) {
    handleError(res, e);
  }
};

export const getContestsByMatch = async (req, res) => {
  try {
    const data = await s.getContestsByMatch(req.params.matchId);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getContestsBySeries = async (req, res) => {
  try {
    const data = await s.getContestsBySeries(req.params.seriesId);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const getContestsByTeam = async (req, res) => {
  try {
    const data = await s.getContestsByTeam(req.params.teamId);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};


/* ================= CONTEST CATEGORY ================= */ 
export const createContestCategory = async (req, res) => {
  try {
    const data = await s.createContestCategory(req.body);
    res.status(201).json({
      success: true,
      data
    });
  } catch (e) {
    handleError(res, e);
  }
};

export const getContestcategory = async (req, res) => {
  try {
    const data = await s.getContestcategory();
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

/* ================= Dashboard ================= */ 

export const getHome = async (req, res) => {
  try {
    const data = await s.getHomeservice();
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

/* ================= DEPOSITE ================= */ 

export const getallDeposites = async (req, res) => {
  try {
    const data = await s.getallDeposites();
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};
export const fetchDeposites = async (req, res) => {
  try {
    const data = await s.fetchDeposites(req.body);
    res.json({ success: true, data });
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

/* ================= WITHDRAW ================= */

export const getallWithdraws = async (req, res) => {
  try {
    const data = await s.getallWithdraws();
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const fetchWithdraws = async (req, res) => {
  try {
    const data = await s.fetchWithdraws(req.body);
    res.json({ success: true, data });
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



/* ================= Users ================= */

export const getallUsers = async (req, res) => {
  try {
    const data = await s.getallUsers();
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};
export const fetchUsers = async (req, res) => {
  try {
    const data = await s.fetchUsers(req.body);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};
export const fetchUsersByKycStatus = async (req, res) => {
  try {
    const data = await s.fetchUsersByKycStatus(req.body);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};

export const fetchUsersByAccountStatus = async (req, res) => {
  try {
    const data = await s.fetchUsersByAccountStatus(req.body);
    res.json({ success: true, data });
  } catch (e) {
    handleError(res, e);
  }
};
