import axios from "axios";
import db from "../../config/db.js";

const TOKEN    = process.env.ENTITYSPORT_TOKEN;
const BASE_URL = "https://soccerapi.entitysport.com";

const getApi = () =>
  axios.create({
    baseURL: BASE_URL,
    params: { token: TOKEN },
  });

const apiGet = async (endpoint, params = {}, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { data } = await getApi().get(endpoint, { params });
      if (data.status === "unauthorized" || data.status === "error") {
        throw new Error(JSON.stringify(data));
      }
      return data;
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = 1000 * attempt;
      console.warn(`API retry ${attempt}/${retries} for ${endpoint} in ${delay}ms — ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
};

const mapPositionType = (type) => {
  if (!type) return "MID";
  switch (type.toUpperCase()) {
    case "G": return "GK";
    case "D": return "DEF";
    case "M": return "MID";
    case "F": return "FWD";
    default:  return "MID";
  }
};

/* ══════════════════════════════════════════
   SERIES
══════════════════════════════════════════ */

export const getAvailableSeriesService = async () => {
  const competitionsMap = new Map();
  const firstData       = await apiGet("/matches", { paged: 1, per_page: 100 });
  const totalPages      = firstData.response.total_pages;

  const collectCompetitions = (items) => {
    for (const match of items) {
      const c = match.competition;
      if (c?.cid && !competitionsMap.has(String(c.cid))) {
        competitionsMap.set(String(c.cid), {
          cid:        String(c.cid),
          name:       c.cname,
          start_date: c.startdate || null,
          end_date:   c.enddate   || null,
          year:       c.year      || null,
        });
      }
    }
  };

  collectCompetitions(firstData.response.items);

  for (let page = 2; page <= Math.min(totalPages, 10); page++) {
    const data = await apiGet("/matches", { paged: page, per_page: 100 });
    collectCompetitions(data.response.items);
  }

  const cids      = [...competitionsMap.keys()];
  const [dbRows]  = await db.query(
    `SELECT seriesid, status, is_selected FROM series WHERE seriesid IN (?)`,
    [cids]
  );
  const dbMap = new Map(dbRows.map((r) => [String(r.seriesid), r]));

  return [...competitionsMap.values()].map((c) => {
    const dbRow = dbMap.get(c.cid);
    return {
      cid:        c.cid,
      name:       c.name,
      start_date: c.start_date,
      end_date:   c.end_date,
      year:       c.year,
      is_active:  dbRow ? dbRow.is_selected === 1 : false,
      status:     dbRow ? dbRow.status : "pending",
    };
  });
};

export const toggleSeriesService = async (seriesIds, isActive) => {
  const results   = [];
  const uniqueIds = [...new Set(seriesIds.map(String))];

  for (const seriesid of uniqueIds) {
    const [[existing]] = await db.query(
      `SELECT id, name FROM series WHERE seriesid = ? LIMIT 1`,
      [seriesid]
    );

    if (!existing) {
      if (!isActive) {
        results.push({ seriesid, error: "Series not in DB yet — toggle ON చేయి ముందు" });
        continue;
      }

      const firstData  = await apiGet("/matches", { paged: 1, per_page: 100 });
      let foundSeries  = null;

      const findSeries = (items) => {
        for (const match of items) {
          if (String(match.competition?.cid) === seriesid) {
            foundSeries = {
              name:       match.competition.cname,
              start_date: match.competition.startdate || null,
              end_date:   match.competition.enddate   || null,
              season:     match.competition.year      || null,
            };
            return true;
          }
        }
        return false;
      };

      if (!findSeries(firstData.response.items)) {
        const totalPages = firstData.response.total_pages;
        for (let page = 2; page <= Math.min(totalPages, 10); page++) {
          const data = await apiGet("/matches", { paged: page, per_page: 100 });
          if (findSeries(data.response.items)) break;
        }
      }

      if (!foundSeries) {
        results.push({ seriesid, error: "Series not found in API" });
        continue;
      }

      await db.query(
        `INSERT INTO series
           (seriesid, name, season, start_date, end_date, status, is_selected, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', 1, NOW())
         ON DUPLICATE KEY UPDATE
           name        = VALUES(name),
           season      = VALUES(season),
           start_date  = VALUES(start_date),
           end_date    = VALUES(end_date),
           status      = 'active',
           is_selected = 1`,
        [seriesid, foundSeries.name, foundSeries.season, foundSeries.start_date, foundSeries.end_date]
      );

      results.push({
        seriesid,
        name:       foundSeries.name,
        season:     foundSeries.season,
        start_date: foundSeries.start_date,
        end_date:   foundSeries.end_date,
        is_active:  true,
      });
      continue;
    }

    await db.query(
      `UPDATE series SET status = ?, is_selected = ? WHERE seriesid = ?`,
      [isActive ? "active" : "inactive", isActive ? 1 : 0, seriesid]
    );

    results.push({ seriesid, name: existing.name, is_active: isActive });
  }

  return results;
};

export const getActiveSeriesService = async () => {
  const [series] = await db.query(
    `SELECT id, seriesid, name, season, start_date, end_date, status, is_selected, created_at
     FROM series WHERE is_selected = 1 ORDER BY created_at DESC`
  );
  return { success: true, data: series };
};

/* ══════════════════════════════════════════
   MATCHES
══════════════════════════════════════════ */

export const getAvailableMatchesService = async (seriesid) => {
  const firstData  = await apiGet("/matches", { competition_id: seriesid, per_page: 100, paged: 1 });
  const totalPages = firstData.response.total_pages;
  const allMatches = [...firstData.response.items];

  for (let page = 2; page <= Math.min(totalPages, 10); page++) {
    const data = await apiGet("/matches", { competition_id: seriesid, per_page: 100, paged: page });
    allMatches.push(...data.response.items);
  }

  const filteredMatches = allMatches.filter(
    (m) => String(m.competition?.cid) === String(seriesid)
  );

  const providerIds = filteredMatches.map((m) => String(m.mid));
  let activeSet     = new Set();

  if (providerIds.length) {
    const [dbRows] = await db.query(
      `SELECT provider_match_id FROM matches WHERE provider_match_id IN (?) AND is_active = 1`,
      [providerIds]
    );
    activeSet = new Set(dbRows.map((r) => String(r.provider_match_id)));
  }

  return filteredMatches.map((m) => ({
    match_id:   String(m.mid),
    home:       m.teams.home.fullname || m.teams.home.tname,
    away:       m.teams.away.fullname || m.teams.away.tname,
    start_time: m.datestart,
    status:     m.status_str,
    round:      m.round || null,
    is_active:  activeSet.has(String(m.mid)),
  }));
};

export const toggleMatchesService = async (matchIds, isActive, seriesId) => {
  const results   = [];
  const uniqueIds = [...new Set(matchIds.map(String))];

  for (const matchId of uniqueIds) {
    const [[existing]] = await db.query(
      `SELECT id, hometeamname, awayteamname, start_time, status
       FROM matches WHERE provider_match_id = ? LIMIT 1`,
      [String(matchId)]
    );

    if (!existing) {
      if (!isActive) {
        results.push({ match_id: String(matchId), error: "Match not found in DB" });
        continue;
      }

      const data      = await apiGet(`/matches/${matchId}/info`);
      const items     = data?.response?.items;
      const matchInfo = items?.match_info?.[0];

      if (!matchInfo) {
        results.push({ match_id: String(matchId), error: "Match not found in API" });
        continue;
      }

      const lookupCid = seriesId ? String(seriesId) : String(matchInfo.competition?.cid);

      const [[seriesRow]] = await db.query(
        `SELECT id, seriesid FROM series WHERE seriesid = ? LIMIT 1`,
        [lookupCid]
      );

      if (!seriesRow) {
        results.push({ match_id: String(matchId), error: "Series not active — series toggle ON చేయి ముందు" });
        continue;
      }

      const homeTid = String(matchInfo.teams?.home?.tid);
      const awayTid = String(matchInfo.teams?.away?.tid);

      const [teamRows] = await db.query(
        `SELECT id, provider_team_id FROM teams WHERE provider_team_id IN (?)`,
        [[homeTid, awayTid]]
      );
      let teamMap = new Map(teamRows.map((r) => [r.provider_team_id, r.id]));

      const missingTids = [homeTid, awayTid].filter((tid) => !teamMap.has(tid));

      if (missingTids.length) {
        const teamsData = [
          { tid: homeTid, team: matchInfo.teams?.home },
          { tid: awayTid, team: matchInfo.teams?.away },
        ].filter(({ tid }) => missingTids.includes(tid));

        for (const { tid, team } of teamsData) {
          await db.query(
            `INSERT INTO teams (name, short_name, series_id, provider_team_id)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE name = VALUES(name), short_name = VALUES(short_name)`,
            [
              team?.fullname || team?.tname,
              team?.abbr || (team?.tname || "").substring(0, 3),
              seriesRow.seriesid,
              tid,
            ]
          );
        }

        const [refreshedRows] = await db.query(
          `SELECT id, provider_team_id FROM teams WHERE provider_team_id IN (?)`,
          [[homeTid, awayTid]]
        );
        teamMap = new Map(refreshedRows.map((r) => [r.provider_team_id, r.id]));
      }

      await db.query(
        `INSERT INTO matches
           (provider_match_id, series_id, home_team_id, away_team_id,
            start_time, status, seriesname, hometeamname, awayteamname, matchdate, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE is_active = 1`,
        [
          String(matchId),
          seriesRow.seriesid,
          teamMap.get(homeTid) || null,
          teamMap.get(awayTid) || null,
          matchInfo.datestart,
          matchInfo.status_str,
          matchInfo.competition?.cname || "",
          matchInfo.teams?.home?.fullname || matchInfo.teams?.home?.tname,
          matchInfo.teams?.away?.fullname || matchInfo.teams?.away?.tname,
          matchInfo.datestart,
        ]
      );

      try {
        const playerCount = await syncPlayersService(String(matchId));
        console.log(`Auto-synced ${playerCount} players for match: ${matchId}`);
      } catch (syncErr) {
        console.error(`Players sync failed for match ${matchId}:`, syncErr.message);
      }

      results.push({
        match_id:   String(matchId),
        home:       matchInfo.teams?.home?.fullname || matchInfo.teams?.home?.tname,
        away:       matchInfo.teams?.away?.fullname || matchInfo.teams?.away?.tname,
        start_time: matchInfo.datestart,
        is_active:  true,
      });
      continue;
    }

    /* ─── Already exists — just toggle ─── */
    await db.query(
      `UPDATE matches SET is_active = ? WHERE provider_match_id = ?`,
      [isActive ? 1 : 0, String(matchId)]
    );

    if (isActive) {
      const [[{ count }]] = await db.query(
        `SELECT COUNT(*) as count FROM players
         WHERE team_id IN (
           SELECT home_team_id FROM matches WHERE provider_match_id = ?
           UNION ALL
           SELECT away_team_id FROM matches WHERE provider_match_id = ?
         )`,
        [String(matchId), String(matchId)]
      );

      if (count < 40) {
        try {
          const synced = await syncPlayersService(String(matchId));
          console.log(`Auto-synced ${synced} players for existing match: ${matchId}`);
        } catch (syncErr) {
          console.error(`Players sync failed for match ${matchId}:`, syncErr.message);
        }
      } else {
        console.log(`Players already exist (${count}) for match: ${matchId} — skipping`);
      }
    }

    results.push({
      match_id:   String(matchId),
      home:       existing.hometeamname,
      away:       existing.awayteamname,
      start_time: existing.start_time,
      is_active:  isActive,
    });
  }

  return results;
};

export const getMatchesService = async (seriesid) => {
  const [matches] = await db.query(
    `SELECT id, series_id, seriesname, home_team_id, hometeamname,
            away_team_id, awayteamname, matchdate, start_time,
            status, provider_match_id, is_active, created_at
     FROM matches WHERE series_id = ?
     ORDER BY matchdate ASC, start_time ASC`,
    [seriesid]
  );
  return { success: true, data: matches };
};

/* ══════════════════════════════════════════
   PLAYERS
══════════════════════════════════════════ */

export const syncPlayersService = async (matchId) => {
  const [matchRows] = await db.query(
    `SELECT home_team_id, away_team_id FROM matches WHERE provider_match_id = ? LIMIT 1`,
    [matchId]
  );

  if (!matchRows.length) throw new Error("Match not found: " + matchId);

  const teamIds = [matchRows[0].home_team_id, matchRows[0].away_team_id].filter(Boolean);

  const teamResults = await Promise.all(
    teamIds.map(async (teamId) => {
      const [teamRows] = await db.query(
        `SELECT id, name, provider_team_id FROM teams WHERE id = ? LIMIT 1`,
        [teamId]
      );

      if (!teamRows.length) return null;

      const { provider_team_id: providerTeamId, name: teamName, id: internalTeamId } = teamRows[0];

      const data       = await apiGet("/players", { tid: providerTeamId, per_page: 25, paged: 1 });
      const allPlayers = (data.response.items || []).slice(0, 25);

      console.log(`Syncing ${allPlayers.length} players for team: ${teamName}`);

      return { allPlayers, internalTeamId, teamName };
    })
  );

  let totalInserted = 0;

  await Promise.all(
    teamResults
      .filter(Boolean)
      .map(async ({ allPlayers, internalTeamId, teamName }) => {
        if (!allPlayers.length) return;

        const values = allPlayers.map((p) => {
          const pos              = mapPositionType(p.positiontype);
          const providerPlayerId = String(p.pid || p.player_id || p.id);
          return [
            internalTeamId,
            p.fullname || p.title,
            pos,
            pos,
            p.nationality?.name || "",
            parseFloat(p.fantasy_player_rating) || 8.0,
            providerPlayerId,
            0,
          ];
        });

        await db.query(
          `INSERT INTO players
             (team_id, name, position, player_type, country, playercredits, provider_player_id, points)
           VALUES ?
           ON DUPLICATE KEY UPDATE
             name               = VALUES(name),
             position           = VALUES(position),
             playercredits      = VALUES(playercredits),
             country            = VALUES(country),
             provider_player_id = VALUES(provider_player_id)`,
          [values]
        );

        console.log(`Inserted ${allPlayers.length} players for team: ${teamName}`);
        totalInserted += allPlayers.length;
      })
  );

  return totalInserted;
};

/* ══════════════════════════════════════════
   PLAYING XI
══════════════════════════════════════════ */

export const syncPlayingXIService = async (matchId) => {
  const [matchRows] = await db.query(
    `SELECT id, provider_match_id FROM matches WHERE provider_match_id = ? LIMIT 1`,
    [matchId]
  );

  if (!matchRows.length) throw new Error("Match not found: " + matchId);

  const internalMatchId = matchRows[0].id;
  const providerMatchId = matchRows[0].provider_match_id;

  const infoData        = await apiGet(`/matches/${providerMatchId}/info`);
  const items           = infoData?.response?.items;
  const matchInfo       = items?.match_info?.[0];
  const lineupAvailable = matchInfo?.lineupavailable === "true";

  if (!lineupAvailable) {
    return { count: 0, reason: "Lineup not published yet by provider" };
  }

  const lineup = matchInfo?.lineup || [];

  if (!lineup.length) {
    return { count: 0, reason: "Lineup array is empty despite lineupavailable=true" };
  }

  const pids        = [...new Set(lineup.map((p) => String(p.pid)))];
  const [playerRows] = await db.query(
    `SELECT id, provider_player_id FROM players WHERE provider_player_id IN (?)`,
    [pids]
  );
  const playerMap = new Map(playerRows.map((r) => [r.provider_player_id, r.id]));

  let count = 0;

  for (const p of lineup) {
    const internalPlayerId = playerMap.get(String(p.pid));
    if (!internalPlayerId) {
      console.warn(`Player not found in DB: pid=${p.pid}`);
      continue;
    }

    await db.query(
      `INSERT INTO match_players (match_id, player_id, is_playing)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE is_playing = 1`,
      [internalMatchId, internalPlayerId]
    );
    count++;
  }

  return { count, reason: null };
};

/* ══════════════════════════════════════════
   PLAYER POINTS
══════════════════════════════════════════ */

export const syncPlayerPointsService = async (matchId) => {
  const [matchRows] = await db.query(
    `SELECT id, provider_match_id FROM matches WHERE provider_match_id = ? LIMIT 1`,
    [matchId]
  );

  if (!matchRows.length) throw new Error("Match not found: " + matchId);

  const internalMatchId = matchRows[0].id;
  const providerMatchId = matchRows[0].provider_match_id;

  const data      = await apiGet(`/matches/${providerMatchId}/info`);
  const items     = data?.response?.items;
  const matchInfo = items?.match_info?.[0];

  const isCompleted =
    matchInfo?.status_str === "result" ||
    matchInfo?.gamestate_str === "Ended";

  if (!isCompleted) {
    return { count: 0, reason: `Match not completed yet (status: ${matchInfo?.status_str})` };
  }

  const players =
    items?.scorecard   ||
    items?.players     ||
    matchInfo?.players ||
    matchInfo?.lineup  ||
    [];

  if (!players.length) {
    return { count: 0, reason: "No player points data in API response" };
  }

  const pids        = [...new Set(players.map((p) => String(p.pid)))];
  const [playerRows] = await db.query(
    `SELECT id, provider_player_id FROM players WHERE provider_player_id IN (?)`,
    [pids]
  );
  const playerMap = new Map(playerRows.map((r) => [r.provider_player_id, r.id]));

  let count = 0;

  for (const p of players) {
    const internalPlayerId = playerMap.get(String(p.pid));
    if (!internalPlayerId) continue;

    await db.query(
      `INSERT INTO player_match_stats (match_id, player_id, points)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE points = VALUES(points)`,
      [internalMatchId, internalPlayerId, p.fantasy_points || 0]
    );
    count++;
  }

  return { count, reason: null };
};