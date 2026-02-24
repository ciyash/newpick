
import  db  from "../../config/db.js";

export const getAllMatches = async (req, res) => {
  console.log("✅ getAllMatches API HIT");

  try {
    const [rows] = await db.execute(`
      SELECT 
        m.id,
        m.series_id,
        m.start_time,
        m.status,
        m.created_at,

        ht.id AS home_team_id,
        ht.name AS home_team_name,

        at.id AS away_team_id,
        at.name AS away_team_name

      FROM matches m

      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id

      WHERE m.status = 'UPCOMING'
      ORDER BY m.start_time ASC
    `);

    console.log("✅ Matches fetched:", rows.length);

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (error) {
    console.log("❌ Error in getAllMatches:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};




export const getMatchFullDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Get match
    const [[match]] = await db.execute(
      `SELECT * FROM matches WHERE id = ?`,
      [id]
    );

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found"
      });
    }

    // 2️⃣ Get teams
    const [teams] = await db.execute(
      `SELECT * FROM teams WHERE id IN (?, ?)`,
      [match.home_team_id, match.away_team_id]
    );

    // 3️⃣ Get players of both teams
    const [players] = await db.execute(
      `SELECT * FROM players WHERE team_id IN (?, ?)`,
      [match.home_team_id, match.away_team_id]
    );

    return res.status(200).json({
      success: true,
      match,
      teams,
      players
    });

  } catch (error) {
    console.error("getMatchFullDetails Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};
