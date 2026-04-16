import db from "../../config/db.js";


export const getMatchesByTypeService = async (type, userId) => {

  const validTypes = ["LIVE", "RESULT", "COMPLETED", "IN-REVIEW"];

  if (!validTypes.includes(type.toUpperCase())) {
    throw new Error("Invalid match type");
  }

  const [rows] = await db.query(
    `SELECT DISTINCT
        m.id                  AS matchId,
        m.series_id           AS seriesId,
        m.seriesname,
        m.home_team_id        AS homeTeamId,
        m.away_team_id        AS awayTeamId,
        m.hometeamname,
        m.awayteamname,
        ht.logo               AS homeTeamLogo,
        at.logo               AS awayTeamLogo,
        m.start_time          AS startTime,
        m.matchdate           AS matchDate,
        m.status,
        m.is_active           AS isActive,
        ce.contest_id         AS contestId,
        ce.user_team_id       AS userTeamId,
        ce.urank,
        ce.winning_amount     AS winningAmount,
        ce.status             AS entryStatus,
        c.prize_pool          AS prizePool,
        c.first_prize         AS firstPrize,
        c.total_winners       AS totalWinners,
        c.contest_type        AS contestType,
        c.status              AS contestStatus
     FROM matches m
     INNER JOIN contest c        ON c.match_id   = m.id
     INNER JOIN contest_entries ce ON ce.contest_id = c.id
     LEFT JOIN  teams ht         ON ht.id = m.home_team_id
     LEFT JOIN  teams at         ON at.id = m.away_team_id
     WHERE m.is_active = 1
       AND m.status    = ?
       AND ce.user_id  = ?
     ORDER BY m.matchdate ASC`,
    [type.toUpperCase(), userId]
  );

  // Group by match — ఒక match కి multiple contests/teams ఉండవచ్చు
  const matchMap = {};

  rows.forEach((row) => {
    if (!matchMap[row.matchId]) {
      matchMap[row.matchId] = {
        matchId:       row.matchId,
        seriesId:      row.seriesId,
        seriesName:    row.seriesname,
        homeTeamId:    row.homeTeamId,
        awayTeamId:    row.awayTeamId,
        homeTeamName:  row.hometeamname,
        awayTeamName:  row.awayteamname,
        homeTeamLogo:  row.homeTeamLogo  || null,
        awayTeamLogo:  row.awayTeamLogo  || null,
        startTime:     row.startTime,
        matchDate:     row.matchDate,
        status:        row.status,
        entries:       [],
      };
    }

    matchMap[row.matchId].entries.push({
      contestId:     row.contestId,
      userTeamId:    row.userTeamId,
      urank:         row.urank         || null,
      winningAmount: Number(row.winningAmount) || 0,
      entryStatus:   row.entryStatus   || null,
      prizePool:     Number(row.prizePool)     || 0,
      firstPrize:    Number(row.firstPrize)    || 0,
      totalWinners:  row.totalWinners  || 0,
      contestType:   row.contestType   || null,
      contestStatus: row.contestStatus || null,
    });
  });

  return Object.values(matchMap);
};

export const getPastMatchesService = async (userId) => {

  const [matches] = await db.query(
    `SELECT 
        m.id AS matchId,
        m.seriesname,
        m.hometeamname,
        m.awayteamname,
        m.matchdate,
        m.start_time,
        m.status,
        t_home.short_name AS home_short,
        t_home.logo      AS home_logo,
        t_away.short_name AS away_short,
        t_away.logo      AS away_logo,
        s.id             AS seriesId,
        s.name           AS seriesName,

        COUNT(DISTINCT ut.id)         AS teamCount,
        COUNT(DISTINCT ce.contest_id) AS contestCount

     FROM contest_entries ce
     JOIN user_teams ut      ON ut.id = ce.user_team_id
     JOIN matches m          ON m.id = ut.match_id
     LEFT JOIN teams t_home  ON t_home.id = m.home_team_id
     LEFT JOIN teams t_away  ON t_away.id = m.away_team_id
     LEFT JOIN series s      ON s.seriesid = m.series_id

     WHERE ce.user_id = ?
       AND m.status = 'RESULT'       -- ✅ Only completed matches

     GROUP BY 
        m.id, m.seriesname, m.hometeamname, m.awayteamname,
        m.matchdate, m.start_time, m.status,
        t_home.short_name, t_home.logo,
        t_away.short_name, t_away.logo,
        s.id, s.name

     ORDER BY m.start_time DESC`,
    [userId]
  );

  if (!matches.length) return [];

  // ✅ Each match లో user teams fetch
  const results = await Promise.all(
    matches.map(async (match) => {

      const [teams] = await db.query(
        `SELECT 
            ut.id       AS teamId,
            ut.team_name AS teamName
         FROM user_teams ut
         JOIN contest_entries ce ON ce.user_team_id = ut.id
         WHERE ut.user_id = ?
           AND ut.match_id = ?
         GROUP BY ut.id, ut.team_name
         ORDER BY ut.created_at ASC`,
        [userId, match.matchId]
      );

      return {
        matchId:      match.matchId,
        seriesId:     match.seriesId,
        seriesName:   match.seriesName || match.seriesname,
        status:       match.status,
        matchDate:    match.matchdate,
        startTime:    match.start_time,
        homeTeam: {
          name:      match.hometeamname,
          shortName: match.home_short,
          logo:      match.home_logo,
        },
        awayTeam: {
          name:      match.awayteamname,
          shortName: match.away_short,
          logo:      match.away_logo,
        },
        teamCount:    match.teamCount,
        contestCount: match.contestCount,
        teams:        teams.map((t) => ({
          teamId:   t.teamId,
          teamName: t.teamName,
        })),
      };
    })
  );

  return results;
};  
