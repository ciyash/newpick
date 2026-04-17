import db from "../../config/db.js";
import { createTeamService,  getMyTeamsWithPlayersService, getMyTeamsXIStatusService, getPlayingXIService, getTeamComparisonService, getTeamPlayersService, updateTeamService } from "./team.service.js";
import { createTeamSchema, updateTeamSchema } from "./team.validation.js";

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
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const userId = req.user.id;

    const { error, value } = createTeamSchema.validate(
      { userId, ...req.body },
      { abortEarly: false, convert: true }
    );

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.details.map((d) => d.message),
      });
    }

    const { matchId, players, captainId, viceCaptainId } = value;

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
      matchId,
    });

  } catch (error) {

    const knownErrors = [
      "Match not found",
      "Team creation is closed for this match",
      "Maximum 20 teams allowed per match",
      "Duplicate team not allowed",
      "One or more players do not belong to this match",
      "One or more players do not exist",
      "Team must have exactly 1 Goalkeeper",
      "Team must have 3 to 6 Defenders",
      "Team must have 2 to 5 Midfielders",
      "Team must have 1 to 3 Forwards",
    ];

    if (knownErrors.includes(error.message)) {
      return res.status(400).json({ success: false, message: error.message });
    }

    console.error("[createTeam]", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


export const getMyTeams = async (req, res) => {
  try {

    const userId = req.user.id;
    const { matchId } = req.params;
    const { contestId } = req.query; 

    const teams = await getMyTeamsWithPlayersService(
      userId,
      matchId,
      contestId
    );

   res.status(200).json({
  success: true,
  total: teams.length,
  data: teams,
  message: teams.length === 0 ? "No teams found" : undefined
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

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const userId = req.user.id;
    const { teamId } = req.params;

    const { error, value } = updateTeamSchema.validate(
      { teamId, ...req.body },
      { abortEarly: false, convert: true }
    );

    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.details.map((d) => d.message),
      });
    }

    const { teamId: validatedTeamId, ...body } = value;

    const result = await updateTeamService(userId, validatedTeamId, body);

    res.status(200).json({
      success: true,
      message: result.message,
    });

  } catch (error) {

    const knownErrors = [
      "Team not found or not yours",
      "Team must have exactly 11 unique players",
      "Captain/VC must be in selected players",
      "Captain and Vice Captain cannot be same",
      "Some players do not belong to this match",
      "Team must have exactly 1 Goalkeeper",
      "Team must have 3 to 6 Defenders",
      "Team must have 2 to 5 Midfielders",
      "Team must have 1 to 3 Forwards",
    ];

    if (knownErrors.includes(error.message)) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // Unknown server error — never leak raw DB errors to client
    console.error("[updateTeam]", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getMyTeamsXIStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { matchId, homeTeamId } = req.params;

    const data = await getMyTeamsXIStatusService(userId, Number(matchId), Number(homeTeamId));

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getPlayingXI = async (req, res) => {
  try {
    const { match_id } = req.params;
    if (!match_id) {
      return res.status(400).json({ success: false, message: "match_id is required" });
    }

    const result = await getPlayingXIService(match_id);
    res.status(200).json(result);
  } catch (err) {
    console.error("getPlayingXI error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getTeamComparison = async (req, res) => {
  try {
    const userId     = req.user?.id;
    const { team_id } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!team_id) {
      return res.status(400).json({ success: false, message: "team_id is required" });
    }

    const result = await getTeamComparisonService(team_id, userId);
    return res.status(200).json(result);

  } catch (err) {
    console.error("[getTeamComparison]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

