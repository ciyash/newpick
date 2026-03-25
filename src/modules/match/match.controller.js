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
//          id, series_id, seriesname,
//          home_team_id, hometeamname,
//          away_team_id, awayteamname,
//          matchdate, start_time, status, is_active
//        FROM matches WHERE id = ?`,
//       [id]
//     );

//     if (!match) {
//       return res.status(404).json({
//         success: false,
//         message: "Match not found",
//       });
//     }

//     // 2️⃣ Get teams
//     const [teams] = await db.execute(
//       `SELECT id, name, short_name, logo, provider_team_id
//        FROM teams WHERE id IN (?, ?)`,
//       [match.home_team_id, match.away_team_id]
//     );

//     const homeTeam = teams.find(
//       (t) => Number(t.id) === Number(match.home_team_id)
//     );

//     const awayTeam = teams.find(
//       (t) => Number(t.id) === Number(match.away_team_id)
//     );

//     // 3️⃣ Get match players
//     const [players] = await db.execute(
//       `SELECT 
//           p.id, p.name, p.position, p.player_type, p.country,
//           p.playercredits, p.playerimage, p.flag_image,
//           p.selectpercent, p.captainper, p.vcper,
//           p.provider_player_id, p.team_id,

//           mp.is_playing,
//           mp.is_substitute,
//           mp.is_pre_squad

//        FROM match_players mp
//        JOIN players p ON p.id = mp.player_id
//        WHERE mp.match_id = ?`,
//       [match.id]
//     );

//     // 🧠 SAFETY: if no players
//     if (!players || players.length === 0) {
//       return res.status(200).json({
//         success: true,
//         data: {
//           match,
//           home_team: { ...homeTeam, playing_xi: [], substitutes: [], squad: [] },
//           away_team: { ...awayTeam, playing_xi: [], substitutes: [], squad: [] },
//           total_players: 0,
//         },
//       });
//     }

//     // 4️⃣ Split players by team
//     const homePlayers = players.filter(
//       (p) => Number(p.team_id) === Number(match.home_team_id)
//     );

//     const awayPlayers = players.filter(
//       (p) => Number(p.team_id) === Number(match.away_team_id)
//     );

//     // ⚠️ Debug logs (remove in prod if needed)
//     console.log("Home Players:", homePlayers.length);
//     console.log("Away Players:", awayPlayers.length);

//     // 5️⃣ Playing XI
//     const homePlayingXI = homePlayers.filter((p) => p.is_playing === 1);
//     const awayPlayingXI = awayPlayers.filter((p) => p.is_playing === 1);

//     // 6️⃣ Substitutes
//     const homeSubs = homePlayers.filter((p) => p.is_substitute === 1);
//     const awaySubs = awayPlayers.filter((p) => p.is_substitute === 1);

//     // 7️⃣ Pre-squad
//     const homeSquad = homePlayers.filter((p) => p.is_pre_squad === 1);
//     const awaySquad = awayPlayers.filter((p) => p.is_pre_squad === 1);

//     // ⚠️ Warning if team missing players
//     if (homePlayers.length === 0 || awayPlayers.length === 0) {
//       console.warn("⚠️ One team has no players mapped!");
//     }

//     return res.status(200).json({
//       success: true,
//       data: {
//         match,

//         home_team: {
//           ...homeTeam,
//           playing_xi: homePlayingXI,
//           substitutes: homeSubs,
//           squad: homeSquad,
//         },

//         away_team: {
//           ...awayTeam,
//           playing_xi: awayPlayingXI,
//           substitutes: awaySubs,
//           squad: awaySquad,
//         },

//         total_players: players.length,
//       },
//     });
//   } catch (error) {
//     console.error("getMatchFullDetails Error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Internal server error",
//     });
//   }
// };


export const getMatchFullDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Get match
    const [[match]] = await db.execute(
      `SELECT 
         id, series_id, seriesname,
         home_team_id, hometeamname,
         away_team_id, awayteamname,
         matchdate, start_time, status, is_active,
         lineupavailable
       FROM matches WHERE id = ?`,
      [id]
    );

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // 2️⃣ Get teams
    const [teams] = await db.execute(
      `SELECT id, name, short_name, logo, provider_team_id
       FROM teams WHERE id IN (?, ?)`,
      [match.home_team_id, match.away_team_id]
    );

    const homeTeam = teams.find(
      (t) => Number(t.id) === Number(match.home_team_id)
    );

    const awayTeam = teams.find(
      (t) => Number(t.id) === Number(match.away_team_id)
    );

    // 3️⃣ lineupavailable బట్టి players తీసుకో
    const lineupAvailable = match.lineupavailable === 1;
    let players = [];

    if (!lineupAvailable) {
      // 🟡 Lineup రాలేదు - squad players చూపించు
      const [allPlayers] = await db.execute(
        `SELECT * FROM players WHERE team_id IN (?, ?)`,
        [match.home_team_id, match.away_team_id]
      );

      players = allPlayers.map((p) => ({
        ...p,
        is_playing: 0,
        is_substitute: 0,
        is_pre_squad: 1,
      }));
    } else {
      // 🟢 Lineup వచ్చింది - match_players నుండి తీసుకో
      const [mpPlayers] = await db.execute(
        `SELECT 
            p.id, p.name, p.position, p.player_type, p.country,
            p.playercredits, p.playerimage, p.flag_image,
            p.selectpercent, p.captainper, p.vcper,
            p.provider_player_id, p.team_id,
            mp.is_playing,
            mp.is_substitute,
            mp.is_pre_squad
         FROM match_players mp
         JOIN players p ON p.id = mp.player_id
         WHERE mp.match_id = ?`,
        [match.id]
      );

      players = mpPlayers;
    }

    // 4️⃣ Split by team
    const homePlayers = players.filter(
      (p) => Number(p.team_id) === Number(match.home_team_id)
    );

    const awayPlayers = players.filter(
      (p) => Number(p.team_id) === Number(match.away_team_id)
    );

    // 5️⃣ Playing XI
    const homePlayingXI = homePlayers.filter((p) => p.is_playing === 1);
    const awayPlayingXI = awayPlayers.filter((p) => p.is_playing === 1);

    // 6️⃣ Substitutes
    const homeSubs = homePlayers.filter((p) => p.is_substitute === 1);
    const awaySubs = awayPlayers.filter((p) => p.is_substitute === 1);

    // 7️⃣ Squad
    const homeSquad = homePlayers.filter((p) => p.is_pre_squad === 1);
    const awaySquad = awayPlayers.filter((p) => p.is_pre_squad === 1);

    // 8️⃣ Lineup Status Label
    let lineup_status;
    if (!lineupAvailable) {
      lineup_status = "not_available"; // ❌ Lineup రాలేదు
    } else {
      const hasPlayingXI =
        homePlayingXI.length > 0 || awayPlayingXI.length > 0;
      lineup_status = hasPlayingXI ? "confirmed" : "announced"; // ✅ or 📋
    }

    console.log("Match:", match.id);
    console.log("Lineup Available:", lineupAvailable);
    console.log("Lineup Status:", lineup_status);
    console.log("Total Players:", players.length);

    return res.status(200).json({
      success: true,
      data: {
        match,

        lineup_status, // "not_available" | "announced" | "confirmed"

        home_team: {
          ...homeTeam,
          playing_xi: homePlayingXI,
          substitutes: homeSubs,
          squad: homeSquad,
        },

        away_team: {
          ...awayTeam,
          playing_xi: awayPlayingXI,
          substitutes: awaySubs,
          squad: awaySquad,
        },

        total_players: players.length,
      },
    });
  } catch (error) {
    console.error("getMatchFullDetails Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
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

  
