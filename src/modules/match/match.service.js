import db from "../../config/db.js";


// export const getMatchesByTypeService = async (type, userId) => {

//   const validTypes = ["LIVE", "RESULT", "COMPLETED", "IN-REVIEW"];

//   if (!validTypes.includes(type.toUpperCase())) {
//     throw new Error("Invalid match type");
//   }  

//   const [rows] = await db.query(
//     `SELECT DISTINCT
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
//      INNER JOIN contest c ON c.match_id = m.id
//      INNER JOIN contest_entries ce ON ce.contest_id = c.id
//      WHERE m.is_active = 1
//        AND m.status = ?
//        AND ce.user_id = ?
//      ORDER BY m.matchdate ASC`,
//     [type.toUpperCase(), userId]
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

export const getPastMatchesService = async (limit = 5) => {
  // 1️⃣ Past completed matches fetch
 
const [matches] = await db.execute(
  `SELECT 
     id, provider_match_id, series_id, seriesname,
     home_team_id, hometeamname,
     away_team_id, awayteamname,
     matchdate, start_time, status, is_active,
     lineupavailable, lineup_status
   FROM matches
   WHERE status = 'RESULT'
   ORDER BY start_time DESC
   LIMIT ${limit}`,   // ✅ ? placeholder replace cheyyi — direct ga limit pettandi
  []
);
  
  if (!matches.length) return [];

  // 2️⃣ Each match full details build
  const results = await Promise.all(
    matches.map(async (match) => {

      // Teams
      const [teams] = await db.execute(
        `SELECT id, name, short_name, logo, provider_team_id
         FROM teams
         WHERE id IN (?, ?)`,
        [match.home_team_id, match.away_team_id]
      );

      const homeTeam = teams.find((t) => Number(t.id) === Number(match.home_team_id)) || null;
      const awayTeam = teams.find((t) => Number(t.id) === Number(match.away_team_id)) || null;

      // match_players count check
      const [[mpCheck]] = await db.execute(
        `SELECT COUNT(*) AS count FROM match_players WHERE match_id = ?`,
        [match.id]
      );

      let players = [];
      const lineupStatus = String(match.lineup_status || '').trim().toLowerCase();

      // match_players lo data unte fetch
      if (Number(mpCheck.count) > 0) {
        const [mpPlayers] = await db.execute(
          `SELECT 
              p.id, p.name, p.position, p.player_type, p.country,
              p.playercredits, p.playerimage, p.flag_image,
              p.selectpercent, p.captainper, p.vcper,
              p.provider_player_id, p.team_id, p.points, p.created_at,
              COALESCE(mp.is_playing, 0)    AS is_playing,
              COALESCE(mp.is_substitute, 0) AS is_substitute,
              COALESCE(mp.is_pre_squad, 0)  AS is_pre_squad
           FROM match_players mp
           JOIN players p ON p.id = mp.player_id
           WHERE mp.match_id = ?`,
          [match.id]
        );
        players = mpPlayers;
      }

      // fallback — players table nundi
      if (players.length === 0) {
        const [allPlayers] = await db.execute(
          `SELECT 
              id, team_id, name, position, player_type, country,
              playercredits, playerimage, flag_image,
              selectpercent, captainper, vcper,
              provider_player_id, points, created_at
           FROM players
           WHERE team_id IN (?, ?)`,
          [match.home_team_id, match.away_team_id]
        );
        players = allPlayers.map((p) => ({
          ...p,
          is_playing: 0,
          is_substitute: 0,
          is_pre_squad: 1,
        }));
      }

      // Team wise split
      const homePlayers = players.filter((p) => Number(p.team_id) === Number(match.home_team_id));
      const awayPlayers = players.filter((p) => Number(p.team_id) === Number(match.away_team_id));

      const homePlayingXI = homePlayers.filter((p) => Number(p.is_playing) === 1);
      const awayPlayingXI = awayPlayers.filter((p) => Number(p.is_playing) === 1);
      const homeSubs      = homePlayers.filter((p) => Number(p.is_substitute) === 1);
      const awaySubs      = awayPlayers.filter((p) => Number(p.is_substitute) === 1);

      let homeSquad = homePlayers.filter((p) => Number(p.is_pre_squad) === 1);
      let awaySquad = awayPlayers.filter((p) => Number(p.is_pre_squad) === 1);

      if (homeSquad.length === 0) homeSquad = homePlayers;
      if (awaySquad.length === 0) awaySquad = awayPlayers;

      // lineup status derive
      let finalLineupStatus = match.lineup_status || 'not_available';
      if (homePlayingXI.length > 0 || awayPlayingXI.length > 0) {
        finalLineupStatus = 'confirmed';
      } else if (players.length > 0) {
        finalLineupStatus = lineupStatus || 'announced';
      }

      return {
        match,
        lineup_status: finalLineupStatus,
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
        counts: {
          total_players: players.length,
          home_players: homePlayers.length,
          away_players: awayPlayers.length,
          home_playing_xi: homePlayingXI.length,
          away_playing_xi: awayPlayingXI.length,
          home_substitutes: homeSubs.length,
          away_substitutes: awaySubs.length,
          home_squad: homeSquad.length,
          away_squad: awaySquad.length,
        },
      };
    })
  );

  return results;
};