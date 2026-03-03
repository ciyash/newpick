import db from "../../config/db.js";
import { createTeamService,  getMyTeamsWithPlayersService, getTeamPlayersService, updateTeamService } from "./team.service.js";


export const getAllTeams = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT *
      FROM teams
      ORDER BY id DESC
    `);

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (error) {
    console.log("❌ Error in getAllTeams:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};



export const getTeamById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Valid team id is required"
      });
    }

    const [rows] = await db.execute(
      `SELECT id, name, short_name, created_at, series_id
       FROM teams
       WHERE id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Team not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    console.log("❌ Error in getTeamById:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};


export const getAllPlayers = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT *
      FROM players
      ORDER BY id DESC
    `);

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (error) {
    console.log("getAllPlayers error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};


export const getPlayerById = async (req, res) => {
  console.log("✅ getPlayerById API HIT");

  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Valid player id is required"
      });
    }

    const [rows] = await db.execute(
      `SELECT * FROM players WHERE id = ?`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Player not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    console.log("❌ Error in getPlayerById:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};


export const getPlayerTeamById = async (req, res) => {
  console.log("✅ getPlayerByTeam API HIT");

  try {
    const team_id = Number(req.params.id);

    if (!team_id) {
      return res.status(400).json({
        success: false,
        message: "Valid team id is required"
      });
    }

    const [rows] = await db.execute(
      `SELECT * FROM players WHERE team_id = ?`,
      [team_id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Player not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    console.log("❌ Error in getPlayerById:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};   




export const createTeam = async (req, res) => {
  try {

    if (!req.user || !req.user.id) {
      throw new Error("User not authenticated");
    }

    const userId = req.user.id;

    const { matchId,  players, captainId, viceCaptainId } = req.body;

    const response = await createTeamService(
      userId,
      matchId,
      players,
      captainId,
      viceCaptainId
    );

      res.status(201).json({
      success: true,
      message: response.message,
      teamId: response.teamId,
      teamName: response.teamName,
      matchId: matchId  
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};


export const getMyTeams = async (req, res) => {
  try {

    const userId = req.user.id;

    // 🔥 PARAMS nundi matchId theeyali
    const { matchId } = req.params;

    const teams = await getMyTeamsWithPlayersService(userId, matchId);

    res.status(200).json({
      success: true,
      total: teams.length,
      data: teams
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};



export const getTeamPlayers = async (req, res) => {
  try {

    const { teamId } = req.params;

    const players = await getTeamPlayersService(teamId);

    res.status(200).json({
      success: true,
      total: players.length,
      data: players
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};




export const getMyTeamsWithPlayers = async (req, res) => {
  try {

    const userId = req.user.id;

    const teams = await getMyTeamsWithPlayersService(userId);

    res.status(200).json({
      success: true,
      total: teams.length,
      data: teams
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};


export const updateTeam = async (req, res) => {
  try {

    const userId = req.user.id;
    const { teamId } = req.params;

    const result = await updateTeamService(
      userId,
      teamId,
      req.body
    );

    res.status(200).json({
      success: true,
      message: result.message
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};