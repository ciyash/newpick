import db from "../../config/db.js";



export const getMatchesByTypeService = async (type, userId) => {

  const validTypes = ["LIVE", "RESULT", "COMPLETED", "INREVIEW"];

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

export const getMatchesService = async (userId, status) => {
  switch (status) {
    case "LIVE":     return getLiveMatches(userId);
    case "UPCOMING": return getUpcomingMatches(userId);
    case "RESULT":   return getPastMatches(userId);
    default: throw new Error("Invalid status");
  }
};

// ✅ LIVE — contest_entries లో JOIN అయిన matches (status = 'LIVE')
const getLiveMatches = async (userId) => {
  const [rows] = await db.query(
    `SELECT DISTINCT
        m.id                AS matchId,
        m.series_id         AS seriesId,
        m.seriesname,
        m.hometeamname,
        m.awayteamname,
        ht.logo             AS homeTeamLogo,
        ht.short_name       AS homeShort,
        at.logo             AS awayTeamLogo,
        at.short_name       AS awayShort,
        m.start_time        AS startTime,
        m.matchdate         AS matchDate,
        m.status,
        ce.contest_id       AS contestId,
        ce.user_team_id     AS userTeamId,
        ce.urank,
        ce.winning_amount   AS winningAmount,
        ce.status           AS entryStatus,
        c.prize_pool        AS prizePool,
        c.first_prize       AS firstPrize,
        c.total_winners     AS totalWinners,
        c.contest_type      AS contestType,
        c.status            AS contestStatus
     FROM matches m
     INNER JOIN contest c          ON c.match_id   = m.id
     INNER JOIN contest_entries ce ON ce.contest_id = c.id
     LEFT JOIN  teams ht           ON ht.id = m.home_team_id
     LEFT JOIN  teams at           ON at.id = m.away_team_id
     WHERE m.is_active = 1
       AND m.status    = 'LIVE'
       AND ce.user_id  = ?
     ORDER BY m.start_time ASC`,
    [userId]
  );

  return groupMatchesWithEntries(rows);
};

// ✅ UPCOMING — user_teams create చేసుకున్న matches (team ఉంటే చాలు, contest join అవ్వాల్సిన అవసరం లేదు)
const getUpcomingMatches = async (userId) => {
  const [rows] = await db.query(
    `SELECT DISTINCT
        m.id                AS matchId,
        m.series_id         AS seriesId,
        m.seriesname,
        m.hometeamname,
        m.awayteamname,
        ht.logo             AS homeTeamLogo,
        ht.short_name       AS homeShort,
        at.logo             AS awayTeamLogo,
        at.short_name       AS awayShort,
        m.start_time        AS startTime,
        m.matchdate         AS matchDate,
        m.status,
        ut.id               AS userTeamId,
        ut.team_name        AS teamName,
        -- contest join చేశాడా లేదా check
        ce.contest_id       AS contestId,
        ce.status           AS entryStatus,
        c.prize_pool        AS prizePool,
        c.first_prize       AS firstPrize,
        c.total_winners     AS totalWinners,
        c.contest_type      AS contestType,
        c.status            AS contestStatus
     FROM matches m
     INNER JOIN user_teams ut      ON ut.match_id = m.id AND ut.user_id = ?
     LEFT JOIN  contest_entries ce ON ce.user_team_id = ut.id AND ce.user_id = ?
     LEFT JOIN  contest c          ON c.id = ce.contest_id
     LEFT JOIN  teams ht           ON ht.id = m.home_team_id
     LEFT JOIN  teams at           ON at.id = m.away_team_id
     WHERE m.is_active = 1
       AND m.status    = 'UPCOMING'
     ORDER BY m.start_time ASC`,
    [userId, userId]
  );

  // Match గా group చేయి, teams + optional entries తో
  const matchMap = {};

  rows.forEach((row) => {
    if (!matchMap[row.matchId]) {
      matchMap[row.matchId] = {
        matchId:      row.matchId,
        seriesId:     row.seriesId,
        seriesName:   row.seriesname,
        homeTeam: {
          name:      row.hometeamname,
          shortName: row.homeShort,
          logo:      row.homeTeamLogo || null,
        },
        awayTeam: {
          name:      row.awayteamname,
          shortName: row.awayShort,
          logo:      row.awayTeamLogo || null,
        },
        startTime:  row.startTime,
        matchDate:  row.matchDate,
        status:     row.status,
        teams:      [],
        contests:   [],
      };
    }

    // Team add (duplicates avoid)
    const match = matchMap[row.matchId];
    if (row.userTeamId && !match.teams.find(t => t.teamId === row.userTeamId)) {
      match.teams.push({ teamId: row.userTeamId, teamName: row.teamName });
    }

    // Contest join అయి ఉంటే add చేయి
    if (row.contestId && !match.contests.find(c => c.contestId === row.contestId)) {
      match.contests.push({
        contestId:    row.contestId,
        entryStatus:  row.entryStatus  || null,
        prizePool:    Number(row.prizePool)    || 0,
        firstPrize:   Number(row.firstPrize)   || 0,
        totalWinners: row.totalWinners || 0,
        contestType:  row.contestType  || null,
        contestStatus:row.contestStatus|| null,
      });
    }
  });

  return Object.values(matchMap);
};

// ✅ RESULT — completed matches (status = 'RESULT')

const getPastMatches = async (userId) => {
  const [matches] = await db.query(
    `SELECT 
        m.id              AS matchId,
        m.seriesname,
        m.hometeamname,
        m.awayteamname,
        m.matchdate,
        m.start_time,
        m.status,
        t_home.short_name AS homeShort,
        t_home.logo       AS homeLogo,
        t_away.short_name AS awayShort,
        t_away.logo       AS awayLogo,
        s.id              AS seriesId,
        s.name            AS seriesName,
        COUNT(DISTINCT ut.id)         AS teamCount,
        COUNT(DISTINCT ce.contest_id) AS contestCount
     FROM contest_entries ce
     JOIN user_teams ut     ON ut.id = ce.user_team_id
     JOIN matches m         ON m.id = ut.match_id
     LEFT JOIN teams t_home ON t_home.id = m.home_team_id
     LEFT JOIN teams t_away ON t_away.id = m.away_team_id
     LEFT JOIN series s     ON s.seriesid = m.series_id
     WHERE ce.user_id = ?
       AND m.status   = 'RESULT'
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

  const results = await Promise.all(
    matches.map(async (match) => {
      const [teams] = await db.query(
        `SELECT ut.id AS teamId, ut.team_name AS teamName
         FROM user_teams ut
         JOIN contest_entries ce ON ce.user_team_id = ut.id
         WHERE ut.user_id = ? AND ut.match_id = ?
         GROUP BY ut.id, ut.team_name
         ORDER BY ut.created_at ASC`,
        [userId, match.matchId]
      );

      // ✅ Contests info add చేయి
      const [contests] = await db.query(
        `SELECT 
           c.id            AS contestId,
           c.contest_type  AS contestType,
           c.status        AS contestStatus,
           c.prize_pool    AS prizePool,
           c.first_prize   AS firstPrize,
           ce.urank,
           ce.winning_amount AS winningAmount
         FROM contest_entries ce
         JOIN contest c ON c.id = ce.contest_id
         JOIN user_teams ut ON ut.id = ce.user_team_id
         WHERE ut.user_id = ? AND ut.match_id = ?`,
        [userId, match.matchId]
      );

      return {
        matchId:      match.matchId,
        seriesId:     match.seriesId,
        seriesName:   match.seriesName || match.seriesname,
        homeTeam: {
          name:      match.hometeamname,
          shortName: match.homeShort,
          logo:      match.homeLogo,
        },
        awayTeam: {
          name:      match.awayteamname,
          shortName: match.awayShort,
          logo:      match.awayLogo,
        },
        matchDate:    match.matchdate,
        startTime:    match.start_time,
        status:       match.status,
        teamCount:    match.teamCount,
        contestCount: match.contestCount,
        teams:        teams.map(t => ({ teamId: t.teamId, teamName: t.teamName })),
        // ✅ contests info
        contests:     contests.map(c => ({
          contestId:     c.contestId,
          contestType:   c.contestType,
          contestStatus: c.contestStatus,  // INREVIEW or COMPLETED
          prizePool:     Number(c.prizePool) || 0,
          firstPrize:    Number(c.firstPrize) || 0,
          urank:         c.urank || null,
          winningAmount: Number(c.winningAmount) || 0,
        })),
      };
    })
  );

  return results;
};

// Helper — LIVE matches grouping
const groupMatchesWithEntries = (rows) => {
  const matchMap = {};
  rows.forEach((row) => {
    if (!matchMap[row.matchId]) {
      matchMap[row.matchId] = {
        matchId:     row.matchId,
        seriesId:    row.seriesId,
        seriesName:  row.seriesname,
        homeTeam: {
          name:      row.hometeamname,
          shortName: row.homeShort,
          logo:      row.homeTeamLogo || null,
        },
        awayTeam: {
          name:      row.awayteamname,
          shortName: row.awayShort,
          logo:      row.awayTeamLogo || null,
        },
        startTime: row.startTime,
        matchDate:  row.matchDate,
        status:     row.status,
        entries:    [],
      };
    }
    matchMap[row.matchId].entries.push({
      contestId:    row.contestId,
      userTeamId:   row.userTeamId,
      urank:        row.urank         || null,
      winningAmount:Number(row.winningAmount) || 0,
      entryStatus:  row.entryStatus   || null,
      prizePool:    Number(row.prizePool)     || 0,
      firstPrize:   Number(row.firstPrize)    || 0,
      totalWinners: row.totalWinners  || 0,
      contestType:  row.contestType   || null,
      contestStatus:row.contestStatus || null,
    });
  });
  return Object.values(matchMap);
};