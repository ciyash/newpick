import db from "../../config/db.js";



// export const getMatchesByTypeService = async (userId, type) => {

//   let statusList = [];

//   switch (type) {

//     case "upcoming":
//       statusList = ["upcoming"];
//       break;

//     case "live":
//       statusList = ["live"];
//       break;

//     case "completed":
//       statusList = ["result", "completed"];
//       break;

//     default:
//       throw new Error("Invalid match type");
//   }

//   // dynamic placeholders
//   const placeholders = statusList.map(() => "?").join(",");

//   const [rows] = await db.query(
//     `SELECT 
//         m.id,
//         m.series_id,
//         m.seriesname,
//         m.home_team_id,
//         m.away_team_id,
//         m.hometeamname,
//         m.awayteamname,
//         m.start_time,
//         m.matchdate,
//         m.status
//      FROM matches m
//      JOIN contest c ON c.match_id = m.id
//      JOIN contest_entries ce ON ce.contest_id = c.id
//      WHERE ce.user_id = ?
//      AND m.status IN (${placeholders})
//      GROUP BY m.id
//      ORDER BY m.start_time DESC`,
//     [userId, ...statusList]
//   );

//   return rows;
// };



// export const getMatchesByTypeService = async (type) => {

//   const [rows] = await db.query(
//     `SELECT 
//         m.id,
//         m.series_id,
//         m.seriesname,
//         m.home_team_id,
//         m.away_team_id,
//         m.hometeamname,
//         m.awayteamname,
//         m.start_time,
//         m.matchdate,
//         m.is_active
//      FROM matches m
//      WHERE m.is_active = 1
//      ORDER BY m.matchdate ASC`
//   );

//   const now = new Date();

//   const upcoming = [];
//   const live = [];
//   const completed = [];

//   for (const match of rows) {
//     const start = new Date(match.matchdate); // 👈 important

//     if (start > now) {
//       upcoming.push(match);
//     } 
//     else if (start <= now && start > new Date(now - 2 * 60 * 60 * 1000)) {
//       live.push(match);
//     } 
//     else {
//       completed.push(match);
//     }
//   }

//   if (type === "upcoming") return upcoming;
//   if (type === "live") return live;
//   if (type === "completed") return completed;

//   throw new Error("Invalid match type");
// };


export const getMatchesByTypeService = async (type) => {

  const validTypes = ["UPCOMING", "LIVE","RESULT", "COMPLETED", "IN-REVIEW"];

  if (!validTypes.includes(type.toUpperCase())) {
    throw new Error("Invalid match type");
  }

  const [rows] = await db.query(
    `SELECT 
        m.id,
        m.series_id,
        m.seriesname,
        m.home_team_id,
        m.away_team_id,
        m.hometeamname,
        m.awayteamname,
        m.start_time,
        m.matchdate,
        m.status,
        m.is_active
     FROM matches m
     WHERE m.is_active = 1
     AND m.status = ?
     ORDER BY m.matchdate ASC`,
    [type.toUpperCase()]
  );

  return rows;
};