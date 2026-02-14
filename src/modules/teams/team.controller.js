import db from "../../config/db.js";


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
