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
  const matchesList = [];

  const firstData = await apiGet("/matches", { paged: 1, per_page: 100 });
  const totalPages = firstData.response.total_pages;

  const collectMatches = (items) => {
    const now = new Date();
    for (const match of items) {
      const c = match.competition;
      if (!c?.cid) continue;

      const matchDate = new Date(match.datestart);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (matchDate < yesterday) continue;

      matchesList.push({
        cid: String(c.cid),
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

  const cids = [...new Set(matchesList.map((m) => m.cid))];
  if (!cids.length) return [];

  const [dbRows] = await db.query(
    `SELECT seriesid, status, is_selected FROM series WHERE seriesid IN (?)`,
    [cids]
  );

  const dbMap = new Map(dbRows.map((r) => [String(r.seriesid), r]));

  let result = matchesList.map((m) => {
    const dbRow = dbMap.get(m.cid);
    return {
      ...m,
      is_active: dbRow ? dbRow.is_selected === 1 : false,
      status: dbRow ? dbRow.status : "pending",
    };
  });

  result.sort((a, b) => new Date(a.match_date) - new Date(b.match_date));

  return result;
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
    // 2) MATCH NOT EXISTS → CREATE NEW
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
      // 3) TEAMS FETCH
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

      // =========================================================
      // 4) INSERT MISSING TEAMS
      // =========================================================
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
      // 5) INSERT MATCH — duplicate safe
      // =========================================================
      const [[alreadyExists]] = await db.query(
        `SELECT id FROM matches WHERE provider_match_id = ? LIMIT 1`,
        [String(matchId)]
      );

      if (alreadyExists) {
        // ✅ Already exists — just activate + update
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
        // ✅ New match — insert
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
      // 6) AUTO PLAYER SYNC
      // =========================================================
      let syncResult = { success: false, inserted: 0, reason: "Not attempted" };

      try {
        syncResult = await syncPlayersService(String(matchId));
        if (syncResult?.success) {
          console.log(`✅ Auto-synced ${syncResult.inserted} players for match: ${matchId}`);
        } else {
          console.log(`⚠️ Player sync skipped for match: ${matchId} | reason: ${syncResult?.reason}`);
        }
      } catch (syncErr) {
        console.error(`Players sync failed for match ${matchId}:`, syncErr.message);
        syncResult = { success: false, inserted: 0, reason: syncErr.message };
      }

      results.push({
        match_id: String(matchId),
        home: matchInfo.teams?.home?.fullname || matchInfo.teams?.home?.tname,
        away: matchInfo.teams?.away?.fullname || matchInfo.teams?.away?.tname,
        start_time: matchInfo.datestart,
        lineupavailable: matchInfo.lineupavailable === "true",
        is_active: true,
        players_synced: syncResult.inserted || 0,
        player_sync_status: syncResult.success ? "success" : "skipped",
        player_sync_reason: syncResult.reason || null,
      });

      continue;
    }

    // =========================================================
    // 7) MATCH ALREADY EXISTS → TOGGLE is_active
    // =========================================================
    await db.query(
      `UPDATE matches SET is_active = ? WHERE provider_match_id = ?`,
      [isActive ? 1 : 0, String(matchId)]
    );

    let syncResult = null;

    // =========================================================
    // 8) IF ACTIVATING → CHECK & SYNC match_players
    // =========================================================
    if (isActive) {
      const [[matchRow]] = await db.query(
        `SELECT id FROM matches WHERE provider_match_id = ? LIMIT 1`,
        [String(matchId)]
      );

      if (matchRow?.id) {
        const [[{ count }]] = await db.query(
          `SELECT COUNT(*) AS count FROM match_players WHERE match_id = ?`,
          [matchRow.id]
        );

        if (count < 22) {
          try {
            syncResult = await syncPlayersService(String(matchId));
            if (syncResult?.success) {
              console.log(`✅ Auto-synced ${syncResult.inserted} players for existing match: ${matchId}`);
            } else {
              console.log(`⚠️ Player sync skipped for existing match: ${matchId} | reason: ${syncResult?.reason}`);
            }
          } catch (syncErr) {
            console.error(`Players sync failed for match ${matchId}:`, syncErr.message);
            syncResult = { success: false, inserted: 0, reason: syncErr.message };
          }
        } else {
          console.log(`✅ match_players already exist (${count}) for match: ${matchId} — skipping sync`);
          syncResult = { success: true, inserted: 0, reason: "Players already exist" };
        }
      }
    }

    results.push({
      match_id: String(matchId),
      home: existing.hometeamname,
      away: existing.awayteamname,
      start_time: existing.start_time,
      lineupavailable: existing.lineupavailable === 1,
      is_active: isActive,
      players_synced: syncResult?.inserted || 0,
      player_sync_status: syncResult
        ? syncResult.success ? "success" : "skipped"
        : null,
      player_sync_reason: syncResult?.reason || null,
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

    const { id: internalMatchId, home_team_id, away_team_id } = matchRows[0];

    // ============================================
    // 2) FETCH MATCH INFO API
    // ============================================
    const infoData = await apiGet(`/matches/${matchId}/info`);
 console.log("=== RAW API RESPONSE KEYS ===");
  console.log("items keys:", Object.keys(infoData?.response?.items || {}));
  console.log("match_info:", infoData?.response?.items?.match_info?.[0] ? "EXISTS" : "NULL");
  console.log("lineup:", infoData?.response?.items?.match_info?.[0]?.lineup?.length);
  console.log("home_squad:", infoData?.response?.items?.match_info?.[0]?.home_squad?.length);
  console.log("full items sample:", JSON.stringify(infoData?.response?.items).substring(0, 500));

    const matchInfo =
      infoData?.response?.items?.match_info?.[0] ||
      infoData?.response?.items?.match_info ||
      infoData?.response?.match_info?.[0] ||
      infoData?.response?.match_info ||
      infoData?.response?.items?.[0] ||
      null;

    const homeSquad = matchInfo?.home_squad || [];
    const awaySquad = matchInfo?.away_squad || [];

    console.log("pre_squad:", matchInfo?.pre_squad);
    console.log(`Home squad count: ${homeSquad.length}`);
    console.log(`Away squad count: ${awaySquad.length}`);

    // ============================================
    // 3) CLEAR OLD MATCH PLAYERS
    // ============================================
    await conn.query(
      `DELETE FROM match_players WHERE match_id = ?`,
      [internalMatchId]
    );

    let totalInserted = 0;
    let source = "db_roster";

    // ============================================
    // 4) CASE A — REAL SQUAD FROM API
    // ============================================
    const hasRealSquad =
      Array.isArray(homeSquad) &&
      Array.isArray(awaySquad) &&
      homeSquad.length > 0 &&
      awaySquad.length > 0;

    if (hasRealSquad) {
      source = "pre_squad";

      const teamSquads = [
        { players: homeSquad, teamId: home_team_id, label: "HOME" },
        { players: awaySquad, teamId: away_team_id, label: "AWAY" },
      ];

      const seenProviderIds = new Set();

      for (const { players, teamId, label } of teamSquads) {
        console.log(`========== ${label} SQUAD START ==========`);

        for (const p of players) {
          const pos = mapPositionType(
            p.positiontype || p.playing_role || p.role || p.position || p.positionname
          );

          const providerPlayerId = String(
            p.pid || p.player_id || p.id || p.provider_player_id || ""
          );

          if (!providerPlayerId) continue;
          if (seenProviderIds.has(providerPlayerId)) continue;
          seenProviderIds.add(providerPlayerId);

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

          // UPSERT PLAYERS TABLE
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

          // GET INTERNAL PLAYER ID
          const [[playerRow]] = await conn.query(
            `SELECT id FROM players WHERE provider_player_id = ? LIMIT 1`,
            [providerPlayerId]
          );

          if (!playerRow) continue;

          // INSERT MATCH_PLAYERS
          await conn.query(
            `INSERT INTO match_players
               (match_id, player_id, team_id, is_playing, is_substitute, is_pre_squad)
             VALUES (?, ?, ?, 0, 0, 1)
             ON DUPLICATE KEY UPDATE
               team_id       = VALUES(team_id),
               is_playing    = VALUES(is_playing),
               is_substitute = VALUES(is_substitute),
               is_pre_squad  = VALUES(is_pre_squad)`,
            [internalMatchId, playerRow.id, teamId]
          );

          totalInserted++;
        }
      }

      console.log(`✅ Real squad synced: ${totalInserted} players for match ${matchId}`);
    }

    // ============================================
    // 5) CASE B — NO REAL SQUAD → USE TEAM ROSTER
    // ============================================
    else {
      console.warn(`⚠️ No real squad found for match ${matchId}, using team roster`);

      let [dbPlayers] = await conn.query(
        `SELECT id, team_id, position FROM players WHERE team_id IN (?, ?)`,
        [home_team_id, away_team_id]
      );

      let homeCount = dbPlayers.filter(
        (p) => Number(p.team_id) === Number(home_team_id)
      ).length;

      let awayCount = dbPlayers.filter(
        (p) => Number(p.team_id) === Number(away_team_id)
      ).length;

      // If not enough players → sync from /team/{tid}/info
      if (homeCount < 8 || awayCount < 8) {
        const [teamRows] = await conn.query(
          `SELECT id, provider_team_id, name FROM teams WHERE id IN (?, ?)`,
          [home_team_id, away_team_id]
        );

        const homeTeam = teamRows.find(
          (t) => Number(t.id) === Number(home_team_id)
        );
        const awayTeam = teamRows.find(
          (t) => Number(t.id) === Number(away_team_id)
        );

        if (homeTeam?.provider_team_id) {
          console.log(`🔄 Syncing roster for home team: ${homeTeam.name}`);
          // ✅ conn first parameter గా pass చేయి
          await syncTeamRosterService(conn, homeTeam.provider_team_id, home_team_id);
        }

        if (awayTeam?.provider_team_id) {
          console.log(`🔄 Syncing roster for away team: ${awayTeam.name}`);
          // ✅ conn first parameter గా pass చేయి
          await syncTeamRosterService(conn, awayTeam.provider_team_id, away_team_id);
        }

        // Re-fetch after sync
        [dbPlayers] = await conn.query(
          `SELECT id, team_id, position FROM players WHERE team_id IN (?, ?)`,
          [home_team_id, away_team_id]
        );

        homeCount = dbPlayers.filter(
          (p) => Number(p.team_id) === Number(home_team_id)
        ).length;

        awayCount = dbPlayers.filter(
          (p) => Number(p.team_id) === Number(away_team_id)
        ).length;
      }

      console.log(`DB Home players: ${homeCount}`);
      console.log(`DB Away players: ${awayCount}`);

      if (homeCount < 8 || awayCount < 8) {
        await conn.rollback();
        return {
          success: false,
          inserted: 0,
          source: "db_roster",
          reason: "Not enough roster players even after team roster sync",
        };
      }

      for (const p of dbPlayers) {
        await conn.query(
          `INSERT INTO match_players
             (match_id, player_id, team_id, is_playing, is_substitute, is_pre_squad)
           VALUES (?, ?, ?, 0, 0, 0)
           ON DUPLICATE KEY UPDATE
             team_id       = VALUES(team_id),
             is_playing    = VALUES(is_playing),
             is_substitute = VALUES(is_substitute),
             is_pre_squad  = VALUES(is_pre_squad)`,
          [internalMatchId, p.id, p.team_id]
        );
        totalInserted++;
      }

      console.log(`✅ DB roster synced: ${totalInserted} players for match ${matchId}`);
    }

    // ============================================
    // 6) FINAL COUNT
    // ============================================
    const [[countRow]] = await conn.query(
      `SELECT COUNT(*) AS total FROM match_players WHERE match_id = ?`,
      [internalMatchId]
    );

    await conn.commit();

    return {
      success: true,
      inserted: totalInserted,
      matchId: internalMatchId,
      totalPlayers: countRow.total,
      source,
      reason:
        source === "pre_squad"
          ? "Real squad synced"
          : "Initial player pool created from DB rosters",
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

  const infoData = await apiGet(`/matches/${providerMatchId}/info`);
  const items = infoData?.response?.items;
  const matchInfo = items?.match_info?.[0];

  const lineupAvailable = matchInfo?.lineupavailable === "true";
  const preSquadAvailable = matchInfo?.pre_squad === "true";

  // ============================================
  // ✅ CORRECT LINEUP STRUCTURE
  // ============================================
  const homeLineupPlayers = items?.lineup?.home?.lineup?.player || [];
  const homeSubs          = items?.lineup?.home?.substitutes || [];
  const awayLineupPlayers = items?.lineup?.away?.lineup?.player || [];
  const awaySubs          = items?.lineup?.away?.substitutes || [];

  // ============================================
  // PRE-SQUAD SYNC (lineup రాకముందే)
  // ============================================
  if (!lineupAvailable && preSquadAvailable) {
    const homeSquad = matchInfo?.home_squad || [];
    const awaySquad = matchInfo?.away_squad || [];
    const allSquad  = [...homeSquad, ...awaySquad];

    if (!allSquad.length) {
      return { count: 0, reason: "No pre-squad data available" };
    }

    const pids = [...new Set(allSquad.map((p) => String(p.pid)))];
    const [playerRows] = await db.query(
      `SELECT id, provider_player_id FROM players WHERE provider_player_id IN (?)`,
      [pids]
    );
    const playerMap = new Map(playerRows.map((r) => [r.provider_player_id, r.id]));

    let count = 0;
    for (const p of allSquad) {
      const internalPlayerId = playerMap.get(String(p.pid));
      if (!internalPlayerId) continue;

      await db.query(
        `INSERT INTO match_players
           (match_id, player_id, is_playing, is_substitute, is_pre_squad)
         VALUES (?, ?, 0, 0, 1)
         ON DUPLICATE KEY UPDATE is_pre_squad = 1`,
        [internalMatchId, internalPlayerId]
      );
      count++;
    }

    await db.query(
      `UPDATE matches SET lineupavailable = 0, lineup_status = 'announced' WHERE id = ?`,
      [internalMatchId]
    );

    console.log(`✅ Pre-squad synced: ${count} players — status: announced`);
    return { count, reason: null, type: "pre_squad" };
  }

  if (!lineupAvailable) {
    await db.query(
      `UPDATE matches SET lineupavailable = 0, lineup_status = 'not_available' WHERE id = ?`,
      [internalMatchId]
    );
    return { count: 0, reason: "Lineup not published yet by provider" };
  }

  // ============================================
  // ✅ PLAYING XI SYNC — correct structure
  // ============================================
  const hasLineup =
    homeLineupPlayers.length > 0 || awayLineupPlayers.length > 0;

  if (!hasLineup) {
    return { count: 0, reason: "Lineup array is empty despite lineupavailable=true" };
  }

  // Home Playing XI + Subs
  const homePlayers = [
    ...homeLineupPlayers.map((p) => ({ ...p, is_substitute: 0 })),
    ...homeSubs.map((p) => ({ ...p, is_substitute: 1 })),
  ];

  // Away Playing XI + Subs
  const awayPlayers = [
    ...awayLineupPlayers.map((p) => ({ ...p, is_substitute: 0 })),
    ...awaySubs.map((p) => ({ ...p, is_substitute: 1 })),
  ];

  const allPlayers = [...homePlayers, ...awayPlayers];

  const pids = [...new Set(allPlayers.map((p) => String(p.pid)))];
  const [playerRows] = await db.query(
    `SELECT id, provider_player_id FROM players WHERE provider_player_id IN (?)`,
    [pids]
  );
  const playerMap = new Map(playerRows.map((r) => [r.provider_player_id, r.id]));

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
  console.log(`   Home XI: ${homeLineupPlayers.length}, Home Subs: ${homeSubs.length}`);
  console.log(`   Away XI: ${awayLineupPlayers.length}, Away Subs: ${awaySubs.length}`);

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
 
 