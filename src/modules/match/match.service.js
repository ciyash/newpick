import db from "../../config/db.js";



// export const getMatchesByTypeService = async (type) => {

//   const validTypes = ["UPCOMING", "LIVE","RESULT", "COMPLETED", "IN-REVIEW"];

//   if (!validTypes.includes(type.toUpperCase())) {
//     throw new Error("Invalid match type");
//   }

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
//         m.status,
//         m.is_active
//      FROM matches m
//      WHERE m.is_active = 1
//      AND m.status = ?
//      ORDER BY m.matchdate ASC`,
//     [type.toUpperCase()]
//   );

//   return rows;
// };



export const getMatchesByTypeService = async (type, userId) => {

  const validTypes = ["LIVE", "RESULT", "COMPLETED", "IN-REVIEW"];

  if (!validTypes.includes(type.toUpperCase())) {
    throw new Error("Invalid match type");
  }

  const [rows] = await db.query(
    `SELECT DISTINCT
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
     INNER JOIN contest c ON c.match_id = m.id
     INNER JOIN contest_entries ce ON ce.contest_id = c.id
     WHERE m.is_active = 1
       AND m.status = ?
       AND ce.user_id = ?
     ORDER BY m.matchdate ASC`,
    [type.toUpperCase(), userId]
  );

  return rows;
};