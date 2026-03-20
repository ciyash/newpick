import { getMatchesByTypeService } from "./match.service.js";
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



// export const getMatchFullDetails = async (req, res) => {
//   try {
//     const { id } = req.params;

//     // 1️⃣ Get match
//     const [[match]] = await db.execute(
//       `SELECT 
//          id, provider_match_id, series_id, seriesname,
//          home_team_id, hometeamname,
//          away_team_id, awayteamname,
//          matchdate, start_time, status, is_active
//        FROM matches WHERE id = ?`,
//       [id]
//     );

//     if (!match) {
//       return res.status(404).json({ success: false, message: "Match not found" });
//     }

//     // 2️⃣ Get teams
//     const [teams] = await db.execute(
//       `SELECT id, name, short_name, logo, provider_team_id
//        FROM teams WHERE id IN (?, ?)`,
//       [match.home_team_id, match.away_team_id]
//     );

//     const homeTeam = teams.find((t) => t.id === match.home_team_id);
//     const awayTeam = teams.find((t) => t.id === match.away_team_id);

//     // 3️⃣ Get players of both teams
//     const [players] = await db.execute(
//       `SELECT 
//          id, name, position, player_type, country,
//          playercredits, playerimage, flag_image,
//          selectpercent, captainper, vcper,
//          provider_player_id, team_id
//        FROM players WHERE team_id IN (?, ?)
//        ORDER BY team_id, position`,
//       [match.home_team_id, match.away_team_id]
//     );

//     const homePlayers = players.filter((p) => p.team_id === match.home_team_id);
//     const awayPlayers = players.filter((p) => p.team_id === match.away_team_id);

//     return res.status(200).json({
//       success: true,
//       data: {
//         match,
//         home_team: {
//           ...homeTeam,
//           players: homePlayers,
//         },
//         away_team: {
//           ...awayTeam,
//           players: awayPlayers,
//         },
//         total_players: players.length,
//       },
//     });

//   } catch (error) {
//     console.error("getMatchFullDetails Error:", error);
//     return res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };

export const getMatchFullDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Get match
    const [[match]] = await db.execute(
      `SELECT 
         id, provider_match_id, series_id, seriesname,
         home_team_id, hometeamname,
         away_team_id, awayteamname,
         matchdate, start_time, status, is_active
       FROM matches WHERE id = ?`,
      [id]
    );

    if (!match) {
      return res.status(404).json({ success: false, message: "Match not found" });
    }

    // 2️⃣ Get teams
    const [teams] = await db.execute(
      `SELECT id, name, short_name, logo, provider_team_id
       FROM teams WHERE id IN (?, ?)`,
      [match.home_team_id, match.away_team_id]
    );

    const homeTeam = teams.find((t) => Number(t.id) === Number(match.home_team_id));
    const awayTeam = teams.find((t) => Number(t.id) === Number(match.away_team_id));

    // 3️⃣ Get players of both teams
    const [players] = await db.execute(
      `SELECT 
         id, name, position, player_type, country,
         playercredits, playerimage, flag_image,
         selectpercent, captainper, vcper,
         provider_player_id, team_id
       FROM players WHERE team_id IN (?, ?)
       ORDER BY team_id, position`,
      [match.home_team_id, match.away_team_id]
    );

    // ✅ Number() conversion — string vs integer mismatch fix
    const homePlayers = players.filter((p) => Number(p.team_id) === Number(match.home_team_id));
    const awayPlayers = players.filter((p) => Number(p.team_id) === Number(match.away_team_id));

    return res.status(200).json({
      success: true,
      data: {
        match,
        home_team: {
          ...homeTeam,
          players: homePlayers,
        },
        away_team: {
          ...awayTeam,
          players: awayPlayers,
        },
        total_players: players.length,
      },
    });

  } catch (error) {
    console.error("getMatchFullDetails Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};


export const getMatchesByType = async (req, res) => {
  try {
    const { type } = req.params;

    const data = await getMatchesByTypeService(type);

    res.json({
      success: true,
      total: data.length,
      data,
    });

  } catch (err) {
    console.error("getMatchesByType error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};


