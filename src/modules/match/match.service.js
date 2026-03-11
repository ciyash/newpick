import db from "../../config/db.js";


export const getMatchesByTypeService = async (userId, type) => {

  let statusList = [];

  switch (type) {

    case "upcoming":
      statusList = ["UPCOMING"];
      break;

    case "live":
      statusList = ["LIVE"];
      break;

    case "completed":
      statusList = ["COMPLETED", "ABANDONED", "INREVIEW"];
      break;

    default:
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
        m.status
     FROM matches m
     JOIN contest c ON c.match_id = m.id
     JOIN contest_entries ce ON ce.contest_id = c.id
     WHERE ce.user_id = ?
     AND m.status IN (?)
     ORDER BY m.start_time DESC`,
    [userId, statusList]
  );

  return rows;
};
