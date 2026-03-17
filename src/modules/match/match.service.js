import db from "../../config/db.js";



export const getMatchesByTypeService = async (userId, type) => {

  let statusList = [];

  switch (type) {

    case "upcoming":
      statusList = ["upcoming"];
      break;

    case "live":
      statusList = ["live"];
      break;

    case "completed":
      statusList = ["result", "completed"];
      break;

    default:
      throw new Error("Invalid match type");
  }

  // dynamic placeholders
  const placeholders = statusList.map(() => "?").join(",");

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
        m.status
     FROM matches m
     JOIN contest c ON c.match_id = m.id
     JOIN contest_entries ce ON ce.contest_id = c.id
     WHERE ce.user_id = ?
     AND m.status IN (${placeholders})
     GROUP BY m.id
     ORDER BY m.start_time DESC`,
    [userId, ...statusList]
  );

  return rows;
};
