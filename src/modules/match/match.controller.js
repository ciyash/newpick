
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



export const getMatchById = async (req, res) => {
  console.log("✅ getMatchById API HIT");

  try {
    const matchId = req.params.id;

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

      WHERE m.id = ?
      LIMIT 1
    `, [matchId]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Match not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    console.log("❌ Error in getMatchById:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};
