import * as s from "./admin.service.js";

export const createAdmin = async (req,res) =>
  res.status(201).json({ success:true, data: await s.createAdmin(req.body,req.admin,req.ip) });

export const getAdmins = async (req,res) =>
  res.json({ success:true, data: await s.getAdmins() });

export const getAdminById = async (req,res) =>
  res.json({ success:true, data: await s.getAdminById(req.params.id) });

export const updateAdmin = async (req,res) => {
  await s.updateAdmin(req.params.id,req.body,req.admin,req.ip);
  res.json({ success:true });
};

/* SERIES */
export const createSeries = async (req,res) =>
  res.status(201).json({ success:true, data: await s.createSeries(req.body,req.admin,req.ip) });

export const getSeries = async (req,res) =>
  res.json({ success:true, data: await s.getSeries() });

export const getSeriesById = async (req,res) =>
  res.json({ success:true, data: await s.getSeriesById(req.params.id) });

export const updateSeries = async (req,res) => {
  await s.updateSeries(req.params.id,req.body,req.admin,req.ip);
  res.json({ success:true });
};

/* MATCH */
export const createMatch = async (req,res) =>
  res.status(201).json({ success:true, data: await s.createMatch(req.body,req.admin,req.ip) });

export const getMatches = async (req,res) =>
  res.json({ success:true, data: await s.getMatches() });

export const getMatchById = async (req,res) =>
  res.json({ success:true, data: await s.getMatchById(req.params.id) });
export const getMatchBySeries = async (req,res) =>
  res.json({ success:true, data: await s.getMatchBySeries(req.params.id) });

export const updateMatch = async (req,res) => {
  await s.updateMatch(req.params.id,req.body,req.admin,req.ip);
  res.json({ success:true });
};

/* TEAM */
export const createTeam = async (req,res) =>
  res.status(201).json({ success:true, data: await s.createTeam(req.body,req.admin,req.ip) });

export const getTeams = async (req,res) =>
  res.json({ success:true, data: await s.getTeams() });

export const getTeamById = async (req,res) =>
  res.json({ success:true, data: await s.getTeamById(req.params.id) });

export const updateTeam = async (req,res) => {
  await s.updateTeam(req.params.id,req.body,req.admin,req.ip);
  res.json({ success:true });
};

/* PLAYER */
export const createPlayer = async (req,res) =>
  res.status(201).json({ success:true, data: await s.createPlayer(req.body,req.admin,req.ip) });

export const getPlayers = async (req,res) =>
  res.json({ success:true, data: await s.getPlayers() });

export const getPlayerById = async (req,res) =>
  res.json({ success:true, data: await s.getPlayerById(req.params.id) });

export const getPlayerByTeam = async (req,res) =>
  res.json({ success:true, data: await s.getPlayerByTeam(req.params.id) });

export const updatePlayer = async (req,res) => {
  await s.updatePlayer(req.params.id,req.body,req.admin,req.ip);
  res.json({ success:true });
};
