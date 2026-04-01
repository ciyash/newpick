import axios from "axios";
import db from "../../config/db.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

import countries from "i18n-iso-countries";
countries.registerLocale(require("i18n-iso-countries/langs/en.json"));

const TOKEN = process.env.ENTITYSPORT_TOKEN;
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
      console.warn(
        `API retry ${attempt}/${retries} for ${endpoint} in ${delay}ms — ${err.message}`
      );
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

export const getCountryName = (player) => {
  if (typeof player?.nationality === "object") return player.nationality?.name || "";
  if (typeof player?.nationality === "string") return player.nationality;
  if (typeof player?.country === "string") return player.country;
  return "";
};

/* ══════════════════════════════════════════
   SERIES
══════════════════════════════════════════ */


export const getAvailableSeriesService = async () => {
  const seriesMap = new Map(); // cid → best/nearest match

  const firstData = await apiGet("/matches", { paged: 1, per_page: 100 });
  const totalPages = firstData.response.total_pages;

  const collectMatches = (items) => {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);

    for (const match of items) {
      const c = match.competition;
      if (!c?.cid) continue;

      const matchDate = new Date(match.datestart);
      if (matchDate < yesterday) continue;

      const cid = String(c.cid);

      // Already have this series? Only update if this match is sooner
      if (seriesMap.has(cid)) {
        const existing = seriesMap.get(cid);
        if (matchDate >= new Date(existing.match_date)) continue;
      }

      seriesMap.set(cid, {
        cid,
        name: c.cname,
        start_date: c.startdate || null,
        end_date: c.enddate || null,
        year: c.year || null,
        match_id: match.mid,
        match_name: `${match.teams.home.tname} vs ${match.teams.away.tname}`,
        match_date: match.datestart,
        match_status: match.status_str,
      });
    }
  };

  collectMatches(firstData.response.items);
  for (let page = 2; page <= totalPages; page++) {
    const data = await apiGet("/matches", { paged: page, per_page: 100 });
    collectMatches(data.response.items);
  }

  const matchesList = [...seriesMap.values()];
  const cids = matchesList.map((m) => m.cid);

  if (!cids.length) return [];

  const [dbRows] = await db.query(
    `SELECT seriesid, status, is_selected FROM series WHERE seriesid IN (?)`,
    [cids]
  );

  const dbMap = new Map(dbRows.map((r) => [String(r.seriesid), r]));

  return matchesList
    .map((m) => {
      const dbRow = dbMap.get(m.cid);
      return {
        ...m,
        is_active: dbRow ? dbRow.is_selected === 1 : false,
        status: dbRow ? dbRow.status : "pending",
      };
    })
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
};

export const toggleSeriesService = async (seriesIds, isActive) => {
  const results = [];
  const uniqueIds = [...new Set(seriesIds.map(String))];

  for (const seriesid of uniqueIds) {
    const [[existing]] = await db.query(
      `SELECT id, name FROM series WHERE seriesid = ? LIMIT 1`,
      [seriesid]
    );

    if (!existing) {
      if (!isActive) {
        results.push({
          seriesid,
          error: "Series not in DB yet — toggle ON చేయి ముందు",
        });
        continue;
      }

      const firstData = await apiGet("/matches", { paged: 1, per_page: 100 });
      const totalPages = firstData.response.total_pages;
      let foundSeries = null;

      const findSeries = (items) => {
        for (const match of items) {
          if (String(match.competition?.cid) === seriesid) {
            foundSeries = {
              name: match.competition.cname,
              start_date: match.competition.startdate || null,
              end_date: match.competition.enddate || null,
              season: match.competition.year || null,
            };
            return true;
          }
        }
        return false;
      };

      if (!findSeries(firstData.response.items)) {
        for (let page = 2; page <= totalPages; page++) {
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
        [
          seriesid,
          foundSeries.name,
          foundSeries.season,
          foundSeries.start_date,
          foundSeries.end_date,
        ]
      );

      results.push({
        seriesid,
        name: foundSeries.name,
        season: foundSeries.season,
        start_date: foundSeries.start_date,
        end_date: foundSeries.end_date,
        is_active: true,
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
     FROM series
     WHERE is_selected = 1
     ORDER BY created_at DESC`
  );

  if (!series.length) return { success: true, data: [] };

  const result = [];

  for (const s of series) {
    const data = await apiGet("/matches", {
      competition_id: s.seriesid,
      per_page: 50,
      paged: 1,
    });

    const matches = data?.response?.items || [];

    const upcoming = matches
      .filter((m) => new Date(m.datestart) >= new Date())
      .sort((a, b) => new Date(a.datestart) - new Date(b.datestart));

    const nearestMatch = upcoming[0];

    result.push({
      ...s,
      match_id: nearestMatch ? nearestMatch.mid : null,
      match_name: nearestMatch
        ? `${nearestMatch.teams.home.tname} vs ${nearestMatch.teams.away.tname}`
        : null,
      match_date: nearestMatch ? nearestMatch.datestart : null,
      match_status: nearestMatch ? nearestMatch.status_str : null,
      lineupavailable: nearestMatch
        ? nearestMatch.lineupavailable === "true"
        : false,
    });
  }

  return { success: true, data: result };
};

/* ══════════════════════════════════════════
   MATCHES
══════════════════════════════════════════ */

export const getAvailableMatchesService = async (seriesid) => {
  const firstData = await apiGet("/matches", {
    competition_id: seriesid,
    per_page: 100,
    paged: 1,
  });
  const totalPages = firstData.response.total_pages;
  const allMatches = [...firstData.response.items];

  for (let page = 2; page <= totalPages; page++) {
    const data = await apiGet("/matches", {
      competition_id: seriesid,
      per_page: 100,
      paged: page,
    });
    allMatches.push(...data.response.items);
  }

  const filteredMatches = allMatches.filter(
    (m) => String(m.competition?.cid) === String(seriesid)
  );

  const providerIds = filteredMatches.map((m) => String(m.mid));
  let activeSet = new Set();

  if (providerIds.length) {
    const [dbRows] = await db.query(
      `SELECT provider_match_id FROM matches
       WHERE provider_match_id IN (?) AND is_active = 1`,
      [providerIds]
    );
    activeSet = new Set(dbRows.map((r) => String(r.provider_match_id)));
  }

  return filteredMatches.map((m) => ({
    match_id: String(m.mid),
    home: m.teams.home.fullname || m.teams.home.tname,
    away: m.teams.away.fullname || m.teams.away.tname,
    start_time: m.datestart,
    status: m.status_str,
    round: m.round || null,
    is_active: activeSet.has(String(m.mid)),
  }));
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


export const toggleMatchesService = async (matchIds, isActive, seriesId) => {
  const results = [];
  const uniqueIds = [...new Set(matchIds.map(String))];

  for (const matchId of uniqueIds) {

    // =========================================================
    // 1) CHECK IF MATCH EXISTS IN DB
    // =========================================================
    const [[existing]] = await db.query(
      `SELECT id, hometeamname, awayteamname, start_time, status, lineupavailable
       FROM matches
       WHERE provider_match_id = ?
       LIMIT 1`,
      [String(matchId)]
    );

    // =========================================================
    // 2) MATCH NOT EXISTS → CREATE NEW (match + teams only)
    // =========================================================
    if (!existing) {
      if (!isActive) {
        results.push({ match_id: String(matchId), error: "Match not found in DB" });
        continue;
      }

      const data = await apiGet(`/matches/${matchId}/info`);
      const items = data?.response?.items;
      const matchInfo = items?.match_info?.[0];

      if (!matchInfo) {
        results.push({ match_id: String(matchId), error: "Match not found in API" });
        continue;
      }

      const lookupCid = seriesId
        ? String(seriesId)
        : String(matchInfo.competition?.cid);

      const [[seriesRow]] = await db.query(
        `SELECT id, seriesid FROM series WHERE seriesid = ? LIMIT 1`,
        [lookupCid]
      );

      if (!seriesRow) {
        results.push({
          match_id: String(matchId),
          error: "Series not active — toggle ON చేయి ముందు",
        });
        continue;
      }

      const homeTid = String(matchInfo.teams?.home?.tid);
      const awayTid = String(matchInfo.teams?.away?.tid);

      // =========================================================
      // 3) TEAMS FETCH & INSERT (unchanged)
      // =========================================================
      const [teamRows] = await db.query(
        `SELECT id, provider_team_id FROM teams WHERE provider_team_id IN (?)`,
        [[homeTid, awayTid]]
      );

      let teamMap = new Map(
        teamRows.map((r) => [String(r.provider_team_id), r.id])
      );

      const missingTids = [homeTid, awayTid].filter(
        (tid) => !teamMap.has(String(tid))
      );

      if (missingTids.length) {
        const teamsData = [
          { tid: homeTid, team: matchInfo.teams?.home },
          { tid: awayTid, team: matchInfo.teams?.away },
        ].filter(({ tid }) => missingTids.includes(tid));

        for (const { tid, team } of teamsData) {
          await db.query(
            `INSERT INTO teams
               (name, short_name, series_id, provider_team_id, logo)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               name       = VALUES(name),
               short_name = VALUES(short_name),
               logo       = VALUES(logo)`,
            [
              team?.fullname || team?.tname,
              team?.abbr || (team?.tname || "").substring(0, 3),
              seriesRow.seriesid,
              tid,
              team?.logo || `${process.env.ENTITY_TEAM_IMAGE_URL}/${tid}.png`,
            ]
          );
        }

        const [refreshedRows] = await db.query(
          `SELECT id, provider_team_id FROM teams WHERE provider_team_id IN (?)`,
          [[homeTid, awayTid]]
        );

        teamMap = new Map(
          refreshedRows.map((r) => [String(r.provider_team_id), r.id])
        );
      }

      // =========================================================
      // 4) INSERT / UPDATE MATCH — duplicate safe
      // =========================================================
      const [[alreadyExists]] = await db.query(
        `SELECT id FROM matches WHERE provider_match_id = ? LIMIT 1`,
        [String(matchId)]
      );

      if (alreadyExists) {
        await db.query(
          `UPDATE matches
           SET is_active       = 1,
               lineupavailable = ?,
               lineup_status   = 'not_available',
               series_id       = ?,
               home_team_id    = ?,
               away_team_id    = ?,
               status          = ?,
               seriesname      = ?,
               hometeamname    = ?,
               awayteamname    = ?,
               matchdate       = ?,
               start_time      = ?
           WHERE provider_match_id = ?`,
          [
            matchInfo.lineupavailable === "true" ? 1 : 0,
            seriesRow.seriesid,
            teamMap.get(homeTid) || null,
            teamMap.get(awayTid) || null,
            (matchInfo.status_str || "upcoming").toUpperCase(),
            matchInfo.competition?.cname || "",
            matchInfo.teams?.home?.fullname || matchInfo.teams?.home?.tname,
            matchInfo.teams?.away?.fullname || matchInfo.teams?.away?.tname,
            matchInfo.datestart,
            matchInfo.datestart,
            String(matchId),
          ]
        );
      } else {
        await db.query(
          `INSERT INTO matches
             (provider_match_id, series_id, home_team_id, away_team_id,
              start_time, status, seriesname, hometeamname, awayteamname,
              matchdate, lineupavailable, lineup_status, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            String(matchId),
            seriesRow.seriesid,
            teamMap.get(homeTid) || null,
            teamMap.get(awayTid) || null,
            matchInfo.datestart,
            (matchInfo.status_str || "upcoming").toUpperCase(),
            matchInfo.competition?.cname || "",
            matchInfo.teams?.home?.fullname || matchInfo.teams?.home?.tname,
            matchInfo.teams?.away?.fullname || matchInfo.teams?.away?.tname,
            matchInfo.datestart,
            matchInfo.lineupavailable === "true" ? 1 : 0,
            "not_available",
          ]
        );
      }

      // =========================================================
      // ✅ NO PLAYER SYNC HERE
      // Players are added only via syncPlayingXI (manual or cron)
      // after lineup is confirmed by the provider
      // =========================================================

      results.push({
        match_id: String(matchId),
        home: matchInfo.teams?.home?.fullname || matchInfo.teams?.home?.tname,
        away: matchInfo.teams?.away?.fullname || matchInfo.teams?.away?.tname,
        start_time: matchInfo.datestart,
        lineupavailable: matchInfo.lineupavailable === "true",
        is_active: true,
        note: "Players will be synced automatically when lineup is announced",
      });

      continue;
    }

    // =========================================================
    // 5) MATCH ALREADY EXISTS → TOGGLE is_active only
    // =========================================================
    await db.query(
      `UPDATE matches SET is_active = ? WHERE provider_match_id = ?`,
      [isActive ? 1 : 0, String(matchId)]
    );

    // =========================================================
    // ✅ NO PLAYER SYNC HERE EITHER
    // Cron job handles syncPlayingXI every 15 min automatically
    // =========================================================

    results.push({
      match_id: String(matchId),
      home: existing.hometeamname,
      away: existing.awayteamname,
      start_time: existing.start_time,
      lineupavailable: existing.lineupavailable === 1,
      is_active: isActive,
      note: isActive
        ? "Match activated — lineup sync will happen via cron when announced"
        : "Match deactivated",
    });
  }

  return results;
};


/* ══════════════════════════════════════════
   PLAYERS
══════════════════════════════════════════ */

export const syncTeamRosterService = async (conn, providerTeamId, internalTeamId) => {
  const data = await apiGet(`/team/${providerTeamId}/info`);

  const rawItems = data?.response?.items;
  const firstItem = Array.isArray(rawItems) ? rawItems[0] : rawItems?.[0] || rawItems;
  const players = firstItem?.player || [];

  console.log("======================================");
  console.log("providerTeamId:", providerTeamId);
  console.log("internalTeamId:", internalTeamId);
  console.log("players length:", players.length);
  console.log("======================================");

  if (!Array.isArray(players) || !players.length) {
    return { success: false, inserted: 0, reason: "No team roster players found" };
  }

  let inserted = 0;

  for (const p of players) {
    const pos = mapPositionType(p.positiontype || p.positionname || p.position);
    const providerPlayerId = String(p.pid || p.player_id || p.id || "").trim();

    if (!providerPlayerId) continue;

    const playerName = p.fullname || p.name || "Unknown Player";
    const playerImage = `${process.env.ENTITY_PLAYER_IMAGE_URL}/${providerPlayerId}.png`;
    const countryName = getCountryName(p);
    const countryCode = countryName
      ? countries.getAlpha2Code(countryName, "en")
      : null;
    const flagImage = countryCode
      ? `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
      : null;
    const credits = parseFloat(p.fantasy_player_rating) || 8.0;

    await conn.query(
      `INSERT INTO players
         (team_id, name, position, player_type, country, playercredits,
          provider_player_id, playerimage, flag_image, points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         team_id            = VALUES(team_id),
         name               = VALUES(name),
         position           = VALUES(position),
         player_type        = VALUES(player_type),
         country            = VALUES(country),
         playercredits      = VALUES(playercredits),
         playerimage        = VALUES(playerimage),
         flag_image         = VALUES(flag_image),
         provider_player_id = VALUES(provider_player_id)`,
      [
        internalTeamId,
        playerName,
        pos,
        pos,
        countryName,
        credits,
        providerPlayerId,
        playerImage,
        flagImage,
        0,
      ]
    );

    inserted++;
  }

  return { success: true, inserted };
};


/* ══════════════════════════════════════════
   SYNC PLAYERS (players table only — no match_players)
   Called from toggleMatchesService when match is activated
══════════════════════════════════════════ */

export const syncPlayersService = async (matchId) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // ============================================
    // 1) FETCH MATCH
    // ============================================
    const [matchRows] = await conn.query(
      `SELECT id, home_team_id, away_team_id
       FROM matches
       WHERE provider_match_id = ?
       LIMIT 1`,
      [matchId]
    );

    if (!matchRows.length) throw new Error("Match not found: " + matchId);

    const { home_team_id, away_team_id } = matchRows[0];

    // ============================================
    // 2) FETCH MATCH INFO FROM API
    // ============================================
    const infoData = await apiGet(`/matches/${matchId}/info`);
    const matchInfo = infoData?.response?.items?.match_info?.[0];

    const homeSquad = matchInfo?.home_squad || [];
    const awaySquad = matchInfo?.away_squad || [];

    console.log(`Home squad: ${homeSquad.length}, Away squad: ${awaySquad.length}`);

    // ============================================
    // 3) CASE A — PRE SQUAD FROM API
    // ============================================
    const hasPreSquad = homeSquad.length > 0 && awaySquad.length > 0;

    if (hasPreSquad) {
      const teamSquads = [
        { players: homeSquad, teamId: home_team_id, label: "HOME" },
        { players: awaySquad, teamId: away_team_id, label: "AWAY" },
      ];

      const seenProviderIds = new Set();
      let inserted = 0;

      for (const { players, teamId, label } of teamSquads) {
        console.log(`===== ${label} SQUAD =====`);

        for (const p of players) {
          const providerPlayerId = String(
            p.pid || p.player_id || p.id || ""
          ).trim();

          if (!providerPlayerId) continue;
          if (seenProviderIds.has(providerPlayerId)) continue;
          seenProviderIds.add(providerPlayerId);

          const pos = mapPositionType(
            p.positiontype || p.playing_role || p.role || p.position || p.positionname
          );
          const playerName = p.fullname || p.name || p.title || "Unknown Player";
          const playerImage = `${process.env.ENTITY_PLAYER_IMAGE_URL}/${providerPlayerId}.png`;
          const countryName = getCountryName(p);
          const countryCode = countryName
            ? countries.getAlpha2Code(countryName, "en")
            : null;
          const flagImage = countryCode
            ? `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png`
            : null;
          const credits = parseFloat(p.fantasy_player_rating) || 8.0;

          // ✅ ONLY players table — match_players touch చేయదు
          await conn.query(
            `INSERT INTO players
               (team_id, name, position, player_type, country, playercredits,
                provider_player_id, playerimage, flag_image, points)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               team_id            = VALUES(team_id),
               name               = VALUES(name),
               position           = VALUES(position),
               player_type        = VALUES(player_type),
               country            = VALUES(country),
               playercredits      = VALUES(playercredits),
               playerimage        = VALUES(playerimage),
               flag_image         = VALUES(flag_image),
               provider_player_id = VALUES(provider_player_id)`,
            [
              teamId,
              playerName,
              pos,
              pos,
              countryName,
              credits,
              providerPlayerId,
              playerImage,
              flagImage,
              0,
            ]
          );

          inserted++;
        }
      }

      await conn.commit();
      console.log(`✅ Pre squad synced to players table: ${inserted} players for match ${matchId}`);
      return { success: true, inserted, source: "pre_squad" };
    }

    // ============================================
    // 4) CASE B — NO PRE SQUAD → USE TEAM ROSTER
    // ============================================
    console.warn(`⚠️ No pre squad for match ${matchId}, using team roster`);

    let [dbPlayers] = await conn.query(
      `SELECT id, team_id FROM players WHERE team_id IN (?, ?)`,
      [home_team_id, away_team_id]
    );

    const homeCount = dbPlayers.filter(p => Number(p.team_id) === Number(home_team_id)).length;
    const awayCount = dbPlayers.filter(p => Number(p.team_id) === Number(away_team_id)).length;

    // If not enough → sync from /team/{tid}/info
    if (homeCount < 8 || awayCount < 8) {
      const [teamRows] = await conn.query(
        `SELECT id, provider_team_id, name FROM teams WHERE id IN (?, ?)`,
        [home_team_id, away_team_id]
      );

      const homeTeam = teamRows.find(t => Number(t.id) === Number(home_team_id));
      const awayTeam = teamRows.find(t => Number(t.id) === Number(away_team_id));

      if (homeTeam?.provider_team_id) {
        console.log(`🔄 Syncing roster for home: ${homeTeam.name}`);
        await syncTeamRosterService(conn, homeTeam.provider_team_id, home_team_id);
      }

      if (awayTeam?.provider_team_id) {
        console.log(`🔄 Syncing roster for away: ${awayTeam.name}`);
        await syncTeamRosterService(conn, awayTeam.provider_team_id, away_team_id);
      }

      // Re-fetch after roster sync
      [dbPlayers] = await conn.query(
        `SELECT id, team_id FROM players WHERE team_id IN (?, ?)`,
        [home_team_id, away_team_id]
      );
    }

    const finalHomeCount = dbPlayers.filter(p => Number(p.team_id) === Number(home_team_id)).length;
    const finalAwayCount = dbPlayers.filter(p => Number(p.team_id) === Number(away_team_id)).length;

    if (finalHomeCount < 8 || finalAwayCount < 8) {
      await conn.rollback();
      return {
        success: false,
        inserted: 0,
        source: "team_roster",
        reason: "Not enough players even after team roster sync",
      };
    }

    await conn.commit();
    console.log(`✅ Team roster already in players table: ${dbPlayers.length} players`);
    return {
      success: true,
      inserted: dbPlayers.length,
      source: "team_roster",
    };

  } catch (err) {
    await conn.rollback();
    console.error("❌ syncPlayersService error:", err);
    throw err;
  } finally {
    conn.release();
  }
};


/* ══════════════════════════════════════════
   PLAYING XI — match_players table only
   Called from cron / manual after lineup confirmed
══════════════════════════════════════════ */

export const syncPlayingXIService = async (matchId) => {
  const [matchRows] = await db.query(
    `SELECT id, provider_match_id FROM matches WHERE provider_match_id = ? LIMIT 1`,
    [matchId]
  );

  if (!matchRows.length) throw new Error("Match not found: " + matchId);

  const internalMatchId = matchRows[0].id;
  const providerMatchId = matchRows[0].provider_match_id;

  const infoData = await apiGet(`/matches/${providerMatchId}/info`);
  const items = infoData?.response?.items;
  const matchInfo = items?.match_info?.[0];

  const lineupAvailable = matchInfo?.lineupavailable === "true";

  // ============================================
  // ✅ LINEUP NOT AVAILABLE → return, do nothing
  // ============================================
  if (!lineupAvailable) {
    await db.query(
      `UPDATE matches SET lineupavailable = 0, lineup_status = 'not_available' WHERE id = ?`,
      [internalMatchId]
    );
    return { count: 0, reason: "Lineup not published yet by provider" };
  }

  // ============================================
  // ✅ LINEUP AVAILABLE → only 11 XI + subs
  // ============================================
  const homeLineupPlayers = items?.lineup?.home?.lineup?.player || [];
  const homeSubs          = items?.lineup?.home?.substitutes || [];
  const awayLineupPlayers = items?.lineup?.away?.lineup?.player || [];
  const awaySubs          = items?.lineup?.away?.substitutes || [];

  const hasLineup = homeLineupPlayers.length > 0 || awayLineupPlayers.length > 0;

  if (!hasLineup) {
    return { count: 0, reason: "Lineup array empty despite lineupavailable=true" };
  }

  const homePlayers = [
    ...homeLineupPlayers.map(p => ({ ...p, is_substitute: 0 })),
    ...homeSubs.map(p => ({ ...p, is_substitute: 1 })),
  ];

  const awayPlayers = [
    ...awayLineupPlayers.map(p => ({ ...p, is_substitute: 0 })),
    ...awaySubs.map(p => ({ ...p, is_substitute: 1 })),
  ];

  const allPlayers = [...homePlayers, ...awayPlayers];

  const pids = [...new Set(allPlayers.map(p => String(p.pid)))];
  const [playerRows] = await db.query(
    `SELECT id, provider_player_id FROM players WHERE provider_player_id IN (?)`,
    [pids]
  );
  const playerMap = new Map(playerRows.map(r => [r.provider_player_id, r.id]));

  // ✅ Clear old match_players first
  await db.query(`DELETE FROM match_players WHERE match_id = ?`, [internalMatchId]);

  let count = 0;
  for (const p of allPlayers) {
    const internalPlayerId = playerMap.get(String(p.pid));
    if (!internalPlayerId) {
      console.warn(`Player not found in DB: pid=${p.pid} name=${p.pname}`);
      continue;
    }

    await db.query(
      `INSERT INTO match_players
         (match_id, player_id, is_playing, is_substitute, is_pre_squad)
       VALUES (?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         is_playing    = VALUES(is_playing),
         is_substitute = VALUES(is_substitute)`,
      [
        internalMatchId,
        internalPlayerId,
        p.is_substitute === 0 ? 1 : 0,
        p.is_substitute,
      ]
    );
    count++;
  }

  await db.query(
    `UPDATE matches SET lineupavailable = 1, lineup_status = 'confirmed' WHERE id = ?`,
    [internalMatchId]
  );

  console.log(`✅ Playing XI synced: ${count} players — status: confirmed`);
  console.log(`   Home XI: ${homeLineupPlayers.length}, Subs: ${homeSubs.length}`);
  console.log(`   Away XI: ${awayLineupPlayers.length}, Subs: ${awaySubs.length}`);

  return { count, reason: null, type: "lineup" };
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

  const data = await apiGet(`/matches/${providerMatchId}/info`);
  const items = data?.response?.items;
  const matchInfo = items?.match_info?.[0];

  const isCompleted =
    matchInfo?.status_str === "result" ||
    matchInfo?.gamestate_str === "Ended";

  if (!isCompleted) {
    return {
      count: 0,
      reason: `Match not completed yet (status: ${matchInfo?.status_str})`,
    };
  }

  const players =
    items?.scorecard ||
    items?.players ||
    matchInfo?.players ||
    matchInfo?.lineup ||
    [];

  if (!players.length) {
    return { count: 0, reason: "No player points data in API response" };
  }

  const pids = [...new Set(players.map((p) => String(p.pid)))];
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
 


 