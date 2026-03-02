import db from "../../config/db.js";

export const getMatchesByTypeService = async (type) => {

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
    `SELECT 
        id,
        series_id,
        seriesname,
        home_team_id,
        away_team_id,
        hometeamname,
        awayteamname,
        start_time,
        status
     FROM matches
     WHERE status IN (?)
     ORDER BY start_time DESC`,
    [statusList]
  );

  return rows;
};