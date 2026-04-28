import axios from "axios";
import db from "../../config/db.js";

const TOKEN = process.env.SPORTMONKS_TOKEN;
const BASE_URL = "https://api.sportmonks.com/v3/football";

const apiGet = async (endpoint, params = {}, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {  
    try {
      const { data } = await axios.get(`${BASE_URL}${endpoint}`, {
        params: { api_token: TOKEN, ...params },
      });
      return data;
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = 1000 * attempt;
      console.warn(`API retry ${attempt}/${retries} for ${endpoint} in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
};

// ✅ FIXED: state_id 5 = RESULT, state_id 1 = UPCOMING, rest all = LIVE
const mapStatus = (stateId) => {
  if (stateId === 5)  return "RESULT";   // FT - Full Time
  if (stateId === 1)  return "UPCOMING"; // NS - Not Started
  if (stateId === 17) return "UPCOMING"; // Postponed
  if (stateId === 18) return "UPCOMING"; // Cancelled
  if (stateId === 19) return "UPCOMING"; // Abandoned
  return "LIVE"; // All other states = LIVE (2,3,4,6-16,22,etc.)
};

const mapPosition = (pos) => {
  if (!pos) return "MID";
  const p = pos.toUpperCase();
  if (p.includes("GOAL") || p === "G" || p === "GK") return "GK";
  if (p.includes("DEF") || p === "D")                return "DEF";
  if (p.includes("MID") || p === "M")                return "MID";
  if (p.includes("FOR") || p === "F" || p === "ATT" || p.includes("ATT")) return "FWD";
  return "MID";
};

const getDateRange = (days = 60) => {
  const today  = new Date().toISOString().split("T")[0];
  const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];
  return { today, future };
};

/* ══════════════════════════════════════════
   SERIES
══════════════════════════════════════════ */

export const getAvailableSeriesService = async () => {
  // Step 1: Fetch all leagues
  let allLeagues = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const data = await apiGet("/leagues", { per_page: 100, page });
    allLeagues.push(...(data.data || []));
    hasMore = data.pagination?.has_more || false;
    page++;
    if (page > 5) break;
  }

  if (!allLeagues.length) return [];

  // Step 2: Fetch upcoming fixtures to find active league IDs
  const today  = new Date().toISOString().split("T")[0];
  const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const upcomingLeagueIds = new Set();
  page = 1;
  hasMore = true;

  while (hasMore) {
    const data = await apiGet(`/fixtures/between/${today}/${future}`, {
      per_page: 100,
      page,
    });

    for (const fixture of data.data || []) {
      if (fixture.league_id) upcomingLeagueIds.add(String(fixture.league_id));
    }

    hasMore = data.pagination?.has_more || false;
    page++;

    if (upcomingLeagueIds.size >= allLeagues.length) break;
    if (page > 50) break;
  }

  console.log(`✅ Upcoming league IDs found: ${upcomingLeagueIds.size}`);

  if (!upcomingLeagueIds.size) return [];

  // Step 3: Filter leagues that have upcoming fixtures
  const filteredLeagues = allLeagues.filter((l) =>
    upcomingLeagueIds.has(String(l.id))
  );

  if (!filteredLeagues.length) return [];

  // Step 4: DB lookup
  const leagueIds = filteredLeagues.map((l) => String(l.id));
  const [dbRows] = await db.query(
    `SELECT seriesid, status, is_selected FROM series WHERE seriesid IN (?)`,
    [leagueIds]
  );
  const dbMap = new Map(dbRows.map((r) => [String(r.seriesid), r]));

  return filteredLeagues
    .map((l) => {
      const dbRow = dbMap.get(String(l.id));
      return {
        cid:          String(l.id),
        name:         l.name,
        short_code:   l.short_code || null,
        league_image: l.image_path || null,
        type:         l.type,
        sub_type:     l.sub_type,
        category:     l.category,
        last_played:  l.last_played_at || null,
        is_active:    dbRow ? dbRow.is_selected === 1 : false,
        status:       dbRow ? dbRow.status : "pending",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const toggleSeriesService = async (seriesIds, isActive) => {
  const results  = [];
  const uniqueIds = [...new Set(seriesIds.map(String))];

  for (const seriesid of uniqueIds) {
    const [[existing]] = await db.query(
      `SELECT id, name FROM series WHERE seriesid = ? LIMIT 1`,
      [seriesid]
    );

    if (existing) {
      await db.query(
        `UPDATE series SET status = ?, is_selected = ? WHERE seriesid = ?`,
        [isActive ? "active" : "inactive", isActive ? 1 : 0, seriesid]
      );
      results.push({ seriesid, name: existing.name, is_active: isActive });
      continue;
    }

    if (!isActive) {
      results.push({ seriesid, error: "Series not in DB — toggle ON చేయి ముందు" });
      continue;
    }

    let league = null;
    try {
      const data = await apiGet(`/leagues/${seriesid}`);
      league = data?.data ?? null;
      console.log(`Fetched league: ${league?.name} (id: ${league?.id})`);
    } catch (e) {
      console.error(`League fetch error for ${seriesid}:`, e.response?.data || e.message);
    }

    if (!league) {
      results.push({ seriesid, error: "League not found in API" });
      continue;
    }

    await db.query(
      `INSERT INTO series
         (seriesid, name, season, start_date, end_date, status, is_selected, created_at)
       VALUES (?, ?, ?, ?, ?, 'active', 1, NOW())
       ON DUPLICATE KEY UPDATE
         name        = VALUES(name),
         status      = 'active',
         is_selected = 1`,
      [seriesid, league.name, null, null, null]
    );

    results.push({ seriesid, name: league.name, is_active: true });
  }

  return results;
};

export const getActiveSeriesService = async () => {
  const [series] = await db.query(
    `SELECT id, seriesid, name, season, start_date, end_date, status, is_selected, created_at
     FROM series WHERE is_selected = 1 ORDER BY created_at DESC`
  );

  if (!series.length) return { success: true, data: [] };

  const { today, future } = getDateRange(60);

  const seriesIds   = series.map((s) => String(s.seriesid));
  let allFixtures   = [];
  let page          = 1;
  let hasMore       = true;

  while (hasMore && page <= 10) {
    const data = await apiGet(`/fixtures/between/${today}/${future}`, {
      include:    "participants",
      per_page:   100,
      page,
    });

    const filtered = (data.data || []).filter((f) =>
      seriesIds.includes(String(f.league_id))
    );
    allFixtures.push(...filtered);
    hasMore = data.pagination?.has_more || false;
    page++;
  }

  // Nearest upcoming fixture per league
  const leagueNearestMap = new Map();
  for (const f of allFixtures) {
    const lid = String(f.league_id);
    if (!leagueNearestMap.has(lid)) {
      leagueNearestMap.set(lid, f);
    } else {
      const ex = leagueNearestMap.get(lid);
      if (f.starting_at_timestamp < ex.starting_at_timestamp) {
        leagueNearestMap.set(lid, f);
      }
    }
  }

  const result = series.map((s) => {
    const nearest = leagueNearestMap.get(String(s.seriesid));
    const home    = nearest?.participants?.find((p) => p.meta?.location === "home");
    const away    = nearest?.participants?.find((p) => p.meta?.location === "away");

    return {
      ...s,
      match_id:     nearest ? String(nearest.id)         : null,
      match_name:   nearest ? nearest.name                : null,
      match_date:   nearest ? nearest.starting_at         : null,
      match_status: nearest ? mapStatus(nearest.state_id) : null,
      home:         home?.name        || null,
      home_image:   home?.image_path  || null,
      away:         away?.name        || null,
      away_image:   away?.image_path  || null,
    };
  });

  return { success: true, data: result };
};

/* ══════════════════════════════════════════
   MATCHES
══════════════════════════════════════════ */

export const getAvailableMatchesService = async (seriesid) => {
  const { today, future } = getDateRange(60);
  let allFixtures = [];
  let page        = 1;
  let hasMore     = true;

  while (hasMore) {
    const data = await apiGet(`/fixtures/between/${today}/${future}`, {
      include:  "participants",
      per_page: 100,
      page,
    });

    const filtered = (data.data || []).filter(
      (f) => String(f.league_id) === String(seriesid)
    );
    allFixtures.push(...filtered);

    hasMore = data.pagination?.has_more || false;
    page++;
    if (page > 10) break;
  }

  const providerIds = allFixtures.map((f) => String(f.id));
  let activeSet     = new Set();

  if (providerIds.length) {
    const [dbRows] = await db.query(
      `SELECT provider_match_id FROM matches
       WHERE provider_match_id IN (?) AND is_active = 1`,
      [providerIds]
    );
    activeSet = new Set(dbRows.map((r) => String(r.provider_match_id)));
  }

  return allFixtures.map((f) => {
    const home = f.participants?.find((p) => p.meta?.location === "home");
    const away = f.participants?.find((p) => p.meta?.location === "away");

    const startTimeUTC = toUTCDateTime(f.starting_at_timestamp, f.starting_at);

    return {
      match_id:   String(f.id),
      home:       home?.name        || "",
      home_image: home?.image_path  || null,
      away:       away?.name        || "",
      away_image: away?.image_path  || null,
      start_time: startTimeUTC,
      status:     mapStatus(f.state_id),
      is_active:  activeSet.has(String(f.id)),
    };
  });
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
   HELPER — timestamp to UTC datetime
══════════════════════════════════════════ */
const toUTCDateTime = (timestamp, fallback) => {
  if (timestamp) {
    return new Date(timestamp * 1000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
  }
  return fallback || null;
};

export const toggleMatchesService = async (matchIds, isActive, seriesId) => {
  const results   = [];
  const uniqueIds = [...new Set(matchIds.map(String))];

  for (const matchId of uniqueIds) {
    const [[existing]] = await db.query(
      `SELECT id, hometeamname, awayteamname, start_time, lineupavailable
       FROM matches WHERE provider_match_id = ? LIMIT 1`,
      [matchId]
    );

    // ── EXISTING MATCH — toggle only ──────────────
    if (existing) {
      await db.query(
        `UPDATE matches SET is_active = ? WHERE provider_match_id = ?`,
        [isActive ? 1 : 0, matchId]
      );
      results.push({
        match_id:   matchId,
        home:       existing.hometeamname,
        away:       existing.awayteamname,
        start_time: existing.start_time,
        is_active:  isActive,
        note:       isActive
          ? "Match activated — lineup sync via cron when announced"
          : "Match deactivated",
      });
      continue;
    }

    // ── NEW MATCH ──────────────────────────────────
    if (!isActive) {
      results.push({ match_id: matchId, error: "Match not found in DB" });
      continue;
    }

    const data    = await apiGet(`/fixtures/${matchId}`, { include: "participants;league" });
    const fixture = data?.data;
     console.log("STATISTICS SAMPLE:", JSON.stringify(fixture?.statistics?.slice(0, 5), null, 2));
    if (!fixture) {
      results.push({ match_id: matchId, error: "Match not found in API" });
      continue;
    }

    const home      = fixture.participants?.find((p) => p.meta?.location === "home");
    const away      = fixture.participants?.find((p) => p.meta?.location === "away");
    const lookupCid = seriesId ? String(seriesId) : String(fixture.league_id);

    // ── Series upsert ──────────────────────────────
    let [[seriesRow]] = await db.query(
      `SELECT id, seriesid FROM series WHERE seriesid = ? LIMIT 1`,
      [lookupCid]
    );

    if (!seriesRow) {
      
      let leagueData = null;
      try {
        const res  = await apiGet(`/leagues/${lookupCid}`);
        leagueData = res?.data ?? null;
      } catch (e) {
        console.warn(`League fetch failed for ${lookupCid}:`, e.message);
      }

      await db.query(
        `INSERT INTO series
           (seriesid, name, season, start_date, end_date, status, is_selected, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', 1, NOW())
         ON DUPLICATE KEY UPDATE
           name        = VALUES(name),
           status      = 'active',
           is_selected = 1`,
        [lookupCid, leagueData?.name || `Series ${lookupCid}`, null, null, null]
      );

      console.log(`✅ Series auto-inserted: ${lookupCid} — ${leagueData?.name}`);

   
      [[seriesRow]] = await db.query(
        `SELECT id, seriesid FROM series WHERE seriesid = ? LIMIT 1`,
        [lookupCid]
      );
    } else {
   
      await db.query(
        `UPDATE series SET status = 'active', is_selected = 1 WHERE seriesid = ?`,
        [lookupCid]
      );
      console.log(`✅ Series already exists, updated: ${lookupCid}`);
    }

    if (!seriesRow) {
      results.push({ match_id: matchId, error: "Series insert failed" });
      continue;
    }

    // ── Teams upsert ──────────────────────────────
    const teamIds = {};
    for (const participant of [home, away]) {
      if (!participant) continue;

      await db.query(
        `INSERT INTO teams (name, short_name, series_id, provider_team_id, logo)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name       = VALUES(name),
           short_name = VALUES(short_name),
           logo       = VALUES(logo)`,
        [
          participant.name,
          participant.short_code || participant.name.substring(0, 3),
          seriesRow.seriesid,
          String(participant.id),
          participant.image_path || null,
        ]
      );

      const [[teamRow]] = await db.query(
        `SELECT id FROM teams WHERE provider_team_id = ? LIMIT 1`,
        [String(participant.id)]
      );
      teamIds[participant.meta.location] = teamRow?.id || null;
    }

    // ── Match upsert ──────────────────────────────
    const startingAt    = fixture.starting_at;
    const matchDateOnly = startingAt?.split(" ")[0] || null;

    await db.query(
      `INSERT INTO matches
         (provider_match_id, series_id, home_team_id, away_team_id,
          start_time, status, seriesname, hometeamname, awayteamname,
          matchdate, lineupavailable, lineup_status, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'not_available', 1)
       ON DUPLICATE KEY UPDATE
         is_active     = 1,
         lineup_status = 'not_available',
         series_id     = VALUES(series_id),
         home_team_id  = VALUES(home_team_id),
         away_team_id  = VALUES(away_team_id),
         status        = VALUES(status),
         seriesname    = VALUES(seriesname),
         hometeamname  = VALUES(hometeamname),
         awayteamname  = VALUES(awayteamname),
         matchdate     = VALUES(matchdate),
         start_time    = VALUES(start_time)`,
      [
        matchId,
        seriesRow.seriesid,
        teamIds["home"] || null,
        teamIds["away"] || null,
        startingAt,
        mapStatus(fixture.state_id),
        fixture.league?.name || "",
        home?.name || "",
        away?.name || "",
        matchDateOnly,
      ]
    );

    // ── Squad sync ────────────────────────────────
    try {
      await syncPlayersService(matchId);
    } catch (e) {
      console.warn(`Player sync failed for ${matchId}:`, e.message);
    }

    results.push({
      match_id:   matchId,
      home:       home?.name,
      away:       away?.name,
      start_time: startingAt,
      is_active:  true,
      note:       "Match added + squad synced. Series auto-created if not exists.",
    });
  }

  return results;
};


/* ══════════════════════════════════════════
   PLAYERS (players table only)
══════════════════════════════════════════ */

export const syncPlayersService = async (matchId) => {
  const [[matchRow]] = await db.query(
    `SELECT id, home_team_id, away_team_id FROM matches
     WHERE provider_match_id = ? LIMIT 1`,
    [matchId]
  );
  if (!matchRow) throw new Error("Match not found: " + matchId);

  const [teamRows] = await db.query(
    `SELECT id, provider_team_id, name FROM teams WHERE id IN (?, ?)`,
    [matchRow.home_team_id, matchRow.away_team_id]
  );

  let totalInserted = 0;

  for (const team of teamRows) {
    const data = await apiGet(`/squads/teams/${team.provider_team_id}`, {
      include: "player;position",
    });

    const players = Array.isArray(data?.data)
      ? data.data
      : data?.data?.squad || [];

    if (!players.length) {
      console.warn(`No squad found for team ${team.name} (provider_id: ${team.provider_team_id})`);
      continue;
    }

    console.log("PLAYER RAW SAMPLE:", JSON.stringify(players[0], null, 2));

    for (const p of players) {
      const providerPlayerId = String(p.player_id || p.id || "").trim();
      if (!providerPlayerId) continue;

      const rawPosition =
        p.player?.position?.name         ||
        p.player?.position?.code         ||
        p.position?.name                 ||
        p.position?.code                 ||
        p.player?.detailed_position?.name ||
        null;

      const pos         = mapPosition(rawPosition);
      const playerName  = p.player?.display_name || p.player?.name || p.name || "Unknown";
      const playerImage =
        p.player?.image_path ||
        `https://cdn.sportmonks.com/images/soccer/players/${providerPlayerId}.png`;

      await db.query(
        `INSERT INTO players
           (team_id, name, position, player_type, playercredits,
            provider_player_id, playerimage, points)
         VALUES (?, ?, ?, ?, 8.0, ?, ?, 0)
         ON DUPLICATE KEY UPDATE
           team_id            = VALUES(team_id),
           name               = VALUES(name),
           position           = VALUES(position),
           player_type        = VALUES(player_type),
           playerimage        = VALUES(playerimage),
           provider_player_id = VALUES(provider_player_id)`,
        [team.id, playerName, pos, pos, providerPlayerId, playerImage]
      );

      totalInserted++;
    }
  }

  console.log(` Players synced to players table for match ${matchId}: ${totalInserted}`);
  return { success: true, inserted: totalInserted };
};

/* ══════════════════════════════════════════
   PLAYING XI (match_players table only)
══════════════════════════════════════════ */

export const syncPlayingXIService = async (matchId) => {
  const [[matchRow]] = await db.query(
    `SELECT id, provider_match_id FROM matches
     WHERE provider_match_id = ? LIMIT 1`,
    [matchId]
  );
  if (!matchRow) throw new Error("Match not found: " + matchId);

  const data    = await apiGet(`/fixtures/${matchId}`, { include: "lineups.player" });
  const fixture = data?.data;
  const lineups = fixture?.lineups || [];

  if (!lineups.length) {
    await db.query(
      `UPDATE matches SET lineupavailable = 0, lineup_status = 'not_available' WHERE id = ?`,
      [matchRow.id]
    );
    return { count: 0, reason: "Lineup not published yet" };
  }

  const allLineupPlayers = lineups.map((l) => ({
    pid:             String(l.player_id),
    is_substitute:   l.type_id === 12 ? 1 : 0,
    provider_team_id: String(l.team_id),
  }));

  const pids = [...new Set(allLineupPlayers.map((l) => l.pid))];

  const [playerRows] = await db.query(
    `SELECT id, provider_player_id, team_id FROM players
     WHERE provider_player_id IN (?)`,
    [pids]
  );
  const playerMap = new Map(playerRows.map((r) => [r.provider_player_id, r]));

  // Clean slate — fresh insert
  await db.query(`DELETE FROM match_players WHERE match_id = ?`, [matchRow.id]);

  let count = 0;
  for (const l of allLineupPlayers) {
    const player = playerMap.get(l.pid);
    if (!player) {
      console.warn(`Player not found in DB: pid=${l.pid}`);
      continue;
    }

    await db.query(
      `INSERT INTO match_players
         (match_id, player_id, team_id, is_playing, is_substitute, is_pre_squad)
       VALUES (?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         is_playing    = VALUES(is_playing),
         is_substitute = VALUES(is_substitute),
         is_pre_squad  = 0`,
      [
        matchRow.id,
        player.id,
        player.team_id,
        l.is_substitute === 0 ? 1 : 0,
        l.is_substitute,
      ]
    );
    count++;
  }

  await db.query(
    `UPDATE matches SET lineupavailable = 1, lineup_status = 'confirmed' WHERE id = ?`,
    [matchRow.id]
  );

  console.log(` Playing XI synced: ${count} players for match ${matchId}`);
  return { count, reason: null, type: "lineup" };
};

/* ══════════════════════════════════════════
   PLAYER POINTS
══════════════════════════════════════════ */

/* ─── Fetch Fixtures Between Two Dates ─── */
export const getFixturesBetween = async (fromDate, toDate, page = 1) => {

  const url = `${BASE_URL}/fixtures/between/${fromDate}/${toDate}` +
    `?include=participants;league;state;venue` +
    `&per_page=50` +
    `&page=${page}` +
    `&api_token=${TOKEN}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.errors) {
    throw new Error(data.message || "SportMonks API error");
  }

  return data;
};

/* ─── Fetch ALL pages ─── */
export const getAllFixturesBetween = async (fromDate, toDate) => {

  const first = await getFixturesBetween(fromDate, toDate, 1);

  const totalPages = first.pagination?.last_page || 1;
  let allFixtures = [...(first.data || [])];

  if (totalPages > 1) {
    const promises = [];
    for (let p = 2; p <= totalPages; p++) {
      promises.push(getFixturesBetween(fromDate, toDate, p));
    }
    const rest = await Promise.all(promises);
    rest.forEach(r => allFixtures.push(...(r.data || [])));
  }

  return allFixtures;
};
  

// ─────────────────────────────────────────────────────────────────────────────
// POSITION MAP
// position_id: 24=GK, 25=DEF, 26=MID, 27=FWD
// ─────────────────────────────────────────────────────────────────────────────
const POSITION_MAP = { 24: "GK", 25: "DEF", 26: "MID", 27: "FWD" };

// ─────────────────────────────────────────────────────────────────────────────
// POINTS RULES — per Points-Info doc
// ─────────────────────────────────────────────────────────────────────────────
const GOAL_POINTS   = { FWD: 20, MID: 22, DEF: 24, GK: 24 };
const ASSIST_PTS    = 12;
const YELLOW_PTS    = -4;
const RED_PTS       = -10;
const OWN_GOAL_PTS  = -12;
const PEN_MISS_PTS  = -12;
const STARTED_PTS   = 4;
const SUB_APP_PTS   = 2;
const CLEAN_SHEET   = 8;   // DEF/GK, 60+ mins, goals_conceded = 0
const SEVERE_PTS    = -15; // red + own_goal or red + pen_miss

// ─────────────────────────────────────────────────────────────────────────────
// HELPER — calculate minutes played from lineups + substitution events
// Returns { pid → minutes_played }
// ─────────────────────────────────────────────────────────────────────────────
const calcMinutes = (lineups, events, matchLength = 90) => {
  const minutesMap = {};

  // Starting XI — starts at 0
  for (const l of lineups) {
    if (l.type_id === 11) {
      minutesMap[String(l.player_id)] = { start: 0, end: matchLength };
    }
  }

  // Substitutions — type_id 18
  // player_id = player coming OFF, related_player_id = player coming ON
  for (const e of events) {
    if (e.type_id !== 18) continue;

    const minute    = e.minute || matchLength;
    const playerOff = e.player_id         ? String(e.player_id)         : null;
    const playerOn  = e.related_player_id ? String(e.related_player_id) : null;

    // Player going OFF — set end minute
    if (playerOff && minutesMap[playerOff]) {
      minutesMap[playerOff].end = minute;
    }

    // Player coming ON — starts at this minute
    if (playerOn) {
      minutesMap[playerOn] = { start: minute, end: matchLength };
    }
  }

  // Convert to minutes played
  const result = {};
  for (const [pid, { start, end }] of Object.entries(minutesMap)) {
    result[pid] = Math.max(0, end - start);
  }

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export const syncPlayerPointsService = async (providerMatchId) => {

  // ── 1. Match row from DB ──
  const [[matchRow]] = await db.query(
    `SELECT id, provider_match_id, status FROM matches
     WHERE provider_match_id = ? LIMIT 1`,
    [providerMatchId]
  );
  if (!matchRow) throw new Error("Match not found: " + providerMatchId);

  if (matchRow.status !== "RESULT" && matchRow.status !== "LIVE") {
    return { count: 0, reason: `Match not started yet (status: ${matchRow.status})` };
  }

  // ── 2. Fetch events + lineups from Sportmonks ──
  // const data    = await apiGet(`/fixtures/${providerMatchId}`, { include: "events;lineups" });
  const data = await apiGet(`/fixtures/${providerMatchId}`, { include: "events;lineups;statistics" });
  const fixture = data?.data;
  if (!fixture) return { count: 0, reason: "Fixture not found in API" };

  const events  = fixture.events  || [];
  const lineups = fixture.lineups || [];

  if (!lineups.length) return { count: 0, reason: "No lineup data yet" };

  // ── 3. Build player map: provider_player_id → { id, position } ──
  // Get all provider_player_ids from lineups
  const providerPids = [...new Set(lineups.map(l => String(l.player_id)))];

  const [playerRows] = await db.query(
    `SELECT id, provider_player_id, position FROM players
     WHERE provider_player_id IN (?)`,
    [providerPids]
  );
  const playerMap = new Map(playerRows.map(r => [
    String(r.provider_player_id),
    { id: r.id, position: r.position }
  ]));

  // ── 4. Build team → goals conceded map (for clean sheet) ──
  // Count goals per team_id of the CONCEDING team
  // A goal by participant_id X means X scored → opponent conceded
  const teamGoalsScored = {};
  for (const e of events) {
    if (e.type_id === 14 || e.type_id === 15) { // goal or own goal
      const tid = String(e.participant_id);
      // own goal counts for opponent
      if (e.type_id === 15) {
        // own goal — conceded by participant_id's own team
        teamGoalsScored[tid] = (teamGoalsScored[tid] || 0); // no change for scorer
        // find opponent team id
        const allTeams = [...new Set(lineups.map(l => String(l.team_id)))];
        const oppTeam  = allTeams.find(t => t !== tid);
        if (oppTeam) teamGoalsScored[oppTeam] = (teamGoalsScored[oppTeam] || 0) + 1;
      } else {
        teamGoalsScored[tid] = (teamGoalsScored[tid] || 0) + 1;
      }
    }
  }

  // goals_conceded per team = goals scored by OPPONENT
  const allTeams = [...new Set(lineups.map(l => String(l.team_id)))];
  const teamGoalsConceded = {};
  for (const tid of allTeams) {
    const oppTeam = allTeams.find(t => t !== tid);
    teamGoalsConceded[tid] = oppTeam ? (teamGoalsScored[oppTeam] || 0) : 0;
  }

  // ── 5. Minutes played per player ──
  const minutesMap = calcMinutes(lineups, events, fixture.length || 90);

  // ── 6. Build stats per player from events ──
  const statsMap = {};

  const initStats = (pid) => {
    if (!statsMap[pid]) statsMap[pid] = {
      goals: 0, assists: 0, yellow_cards: 0, red_cards: 0,
      own_goals: 0, penalties_missed: 0,
    };
  };

  for (const e of events) {
    const pid        = e.player_id         ? String(e.player_id)         : null;
    const relatedPid = e.related_player_id ? String(e.related_player_id) : null;

    switch (e.type_id) {
      case 14: // Goal
        if (pid)        { initStats(pid);        statsMap[pid].goals++;   }
        if (relatedPid) { initStats(relatedPid); statsMap[relatedPid].assists++; }
        break;
      case 15: // Own goal
        if (pid) { initStats(pid); statsMap[pid].own_goals++; }
        break;
      case 17: // Missed penalty
        if (pid) { initStats(pid); statsMap[pid].penalties_missed++; }
        break;
      case 19: // Yellow card
        if (pid) { initStats(pid); statsMap[pid].yellow_cards++; }
        break;
      case 20: // Red card
      case 21: // Yellow/Red card
        if (pid) { initStats(pid); statsMap[pid].red_cards++; }
        break;
    }
  }

  // ── 7. Calculate fantasy points per player ──
  let count = 0;

  for (const lineup of lineups) {
    const provPid    = String(lineup.player_id);
    const playerInfo = playerMap.get(provPid);
    if (!playerInfo) continue; // player not in our DB

    const internalId = playerInfo.id;
    const position   = playerInfo.position || "MID"; // GK/DEF/MID/FWD
    const teamId     = String(lineup.team_id);
    const isStarting = lineup.type_id === 11;
    const isBench    = lineup.type_id === 12;
    const minutes    = minutesMap[provPid] || 0;

    // Did this bench player actually come on?
    const subAppearance = isBench && minutes > 0;

    const stats = statsMap[provPid] || {
      goals: 0, assists: 0, yellow_cards: 0, red_cards: 0,
      own_goals: 0, penalties_missed: 0,
    };

    let pts = 0;

    // ── Participation ──
    if (isStarting)    pts += STARTED_PTS;   // +4
    if (subAppearance) pts += SUB_APP_PTS;   // +2

    // ── Goals (position weighted) ──
    pts += stats.goals * (GOAL_POINTS[position] || 20);

    // ── Assists ──
    pts += stats.assists * ASSIST_PTS;

    // ── Discipline ──
    pts += stats.yellow_cards     * YELLOW_PTS;
    pts += stats.red_cards        * RED_PTS;
    pts += stats.own_goals        * OWN_GOAL_PTS;
    pts += stats.penalties_missed * PEN_MISS_PTS;

    // ── Severe misconduct (-15 once) ──
    if (stats.red_cards > 0 && (stats.own_goals > 0 || stats.penalties_missed > 0)) {
      pts += SEVERE_PTS;
    }

    // ── Clean sheet (DEF/GK only, 60+ mins, 0 goals conceded) ──
    const goalsConceded = teamGoalsConceded[teamId] || 0;
    if (
      (position === "DEF" || position === "GK") &&
      minutes >= 60 &&
      goalsConceded === 0
    ) {
      pts += CLEAN_SHEET;
    }

    // ── Full match contribution bonus (+2) ──
    // played full match AND earned ≥2 performance points (before participation bonus)
    const perfPts =
      stats.goals * (GOAL_POINTS[position] || 20) +
      stats.assists * ASSIST_PTS;
    if (minutes >= (fixture.length || 90) && perfPts >= 2) {
      pts += 2;
    }

    // ── Save to player_match_stats ──
    await db.query(
      `INSERT INTO player_match_stats
         (match_id, player_id,
          goals, assists, yellow_cards, red_cards,
          own_goals, penalties_missed,
          started, sub_appearance, played_full_match, minutes_played,
          goals_conceded, fantasy_points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         goals             = VALUES(goals),
         assists           = VALUES(assists),
         yellow_cards      = VALUES(yellow_cards),
         red_cards         = VALUES(red_cards),
         own_goals         = VALUES(own_goals),
         penalties_missed  = VALUES(penalties_missed),
         started           = VALUES(started),
         sub_appearance    = VALUES(sub_appearance),
         played_full_match = VALUES(played_full_match),
         minutes_played    = VALUES(minutes_played),
         goals_conceded    = VALUES(goals_conceded),
         fantasy_points    = VALUES(fantasy_points)`,
      [
        matchRow.id, internalId,
        stats.goals, stats.assists, stats.yellow_cards, stats.red_cards,
        stats.own_goals, stats.penalties_missed,
        isStarting ? 1 : 0,
        subAppearance ? 1 : 0,
        minutes >= (fixture.length || 90) ? 1 : 0,
        minutes,
        goalsConceded,
        pts,
      ]
    );

    count++;
  }

  console.log(`✅ [${matchRow.status}] Points synced: ${count} players for match ${providerMatchId}`);
  return { count, reason: null };
};



export const getMatchesByDateRangeService = async (fromDate, toDate) => {
  // ── All pages fetch ──
  const first = await (async (page) => {
    const url = `${BASE_URL}/fixtures/between/${fromDate}/${toDate}` +
      `?include=participants;league;state;venue;lineups` +
      `&per_page=50` +
      `&page=${page}` +
      `&api_token=${TOKEN}`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!res.ok || data.errors) throw new Error(data.message || "SportMonks API error");
    return data;
  })(1);

  const totalPages  = first.pagination?.last_page || 1;
  let   allFixtures = [...(first.data || [])];

  if (totalPages > 1) {
    const promises = [];
    for (let p = 2; p <= totalPages; p++) {
      promises.push((async (page) => {
        const url = `${BASE_URL}/fixtures/between/${fromDate}/${toDate}` +
          `?include=participants;league;state;venue;lineups` +
          `&per_page=50` +
          `&page=${page}` +
          `&api_token=${TOKEN}`;
        const res  = await fetch(url);
        const data = await res.json();
        return data;
      })(p));
    }
    const rest = await Promise.all(promises);
    rest.forEach(r => allFixtures.push(...(r.data || [])));
  }

  // ── Date filter ──
  const fromDt = new Date(fromDate); fromDt.setHours(0,  0,  0,   0);
  const toDt   = new Date(toDate);   toDt.setHours(23, 59, 59, 999);

  const dateFiltered = allFixtures.filter(f => {
    if (!f.starting_at) return false;
    const d = new Date(f.starting_at);
    return d >= fromDt && d <= toDt;
  });

  // ── Lineup filter — Starting XI ──
  const withLineup = dateFiltered.filter(f => {
    const lineups = f.lineups || [];
    return lineups.some(l => l.type_id === 11);
  });

  // ── Format ──
  return withLineup.map(f => {
    const home = f.participants?.find(p => p.meta?.location === "home");
    const away = f.participants?.find(p => p.meta?.location === "away");

    const homeLineupCount = (f.lineups || []).filter(
      l => String(l.team_id) === String(home?.id) && l.type_id === 11
    ).length;
    const awayLineupCount = (f.lineups || []).filter(
      l => String(l.team_id) === String(away?.id) && l.type_id === 11
    ).length;

    return {
      id:     f.id,
      name:   f.name,
      date:   f.starting_at,
      status: f.state?.name || "Unknown",

      lineup_ready: {
        home: homeLineupCount >= 11,
        away: awayLineupCount >= 11,
        both: homeLineupCount >= 11 && awayLineupCount >= 11,
      },

      league: {
        id:      f.league?.id,
        name:    f.league?.name,
        country: f.league?.country_id,
      },

      venue: {
        id:   f.venue?.id,
        name: f.venue?.name,
        city: f.venue?.city_name,
      },

      home: {
        id:    home?.id,
        name:  home?.name,
        image: home?.image_path,
      },

      away: {
        id:    away?.id,
        name:  away?.name,
        image: away?.image_path,
      },

      score: {
        home: f.scores?.find(
          s => s.description === "CURRENT" && s.score?.participant === "home"
        )?.score?.goals ?? null,
        away: f.scores?.find(
          s => s.description === "CURRENT" && s.score?.participant === "away"
        )?.score?.goals ?? null,
      },
    };
  });
};



export const getPlayerBioService = async (playerId) => {

  // ── 1. DB నుండి provider_player_id fetch ──
  const [[player]] = await db.query(
    `SELECT id, name, position, provider_player_id 
     FROM players WHERE id = ?`,
    [playerId]
  );
  if (!player) throw new Error("Player not found");
  if (!player.provider_player_id) throw new Error("Provider player ID not found");

  // ── 2. Sportmonks API call ──
  const data = await apiGet(`/players/${player.provider_player_id}`, {
    include: [
      "trophies.league",
      "trophies.season",
      "trophies.trophy",
      "trophies.team",
      "teams.team",
      "statistics.details.type",
      "statistics.team",
      "statistics.season.league",
      "latest.fixture.participants",
      "latest.fixture.league",
      "latest.fixture.scores",
      "latest.details.type",
      "nationality",
      "detailedPosition",
    ].join(";"),
  });

  const p = data?.data;
  if (!p) throw new Error("Player data not found from provider");

  // ── 3. Age calculate ──
  const age = p.date_of_birth
    ? Math.floor(
        (new Date() - new Date(p.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000)
      )
    : null;

  // ── 4. Current team — domestic team మాత్రమే ──
  const currentTeam =
    p.teams?.find(t => t.active && t.team?.type === "domestic") ||
    p.teams?.find(t => t.active) ||
    p.teams?.[0] ||
    null;

  // ── 5. Trophies ──
  const trophies = (p.trophies || []).map(t => ({
    trophy_name:  t.trophy?.name       || null,
    league_name:  t.league?.name       || null,
    league_logo:  t.league?.image_path || null,
    season_name:  t.season?.name       || null,
    team_name:    t.team?.name         || null,
    team_logo:    t.team?.image_path   || null,
  }));

  // ── 6. Recent matches ──
  const recent_matches = (p.latest || []).slice(0, 5).map(l => {
    const fixture      = l.fixture || {};
    const participants = fixture.participants || [];
    const home         = participants.find(p => p.meta?.location === "home");
    const away         = participants.find(p => p.meta?.location === "away");
    const scores       = fixture.scores || [];
    const homeScore    = scores.find(
      s => s.participant_id === home?.id && s.description === "CURRENT"
    )?.score?.goals ?? null;
    const awayScore    = scores.find(
      s => s.participant_id === away?.id && s.description === "CURRENT"
    )?.score?.goals ?? null;

    return {
      fixture_id:  fixture.id                || null,
      league_name: fixture.league?.name       || null,
      league_logo: fixture.league?.image_path || null,
      home_team:   home?.name                || null,
      home_logo:   home?.image_path          || null,
      home_score:  homeScore,
      away_team:   away?.name                || null,
      away_logo:   away?.image_path          || null,
      away_score:  awayScore,
      date:        fixture.starting_at       || null,
    };
  });

  // ── 7. Statistics — null values filter ──
  const statistics = (p.statistics || [])
    .filter(s =>
      s.goals !== null ||
      s.assists !== null ||
      s.appearances !== null
    )
    .slice(0, 10)
    .map(s => {
      const details   = s.details || [];
      const getValue  = (name) =>
        details.find(d => d.type?.name === name)?.value?.total ?? null;

      return {
        season_name:    s.season?.name               || null,
        league_name:    s.season?.league?.name        || null,
        league_logo:    s.season?.league?.image_path  || null,
        team_name:      s.team?.name                  || null,
        team_logo:      s.team?.image_path            || null,
        goals:          getValue("Goals"),
        assists:        getValue("Assists"),
        appearances:    getValue("Appearances"),
        minutes_played: getValue("Minutes Played"),
      };
    });

  // ── 8. Final response ──
  return {
    success: true,
    data: {
      player_id:      player.id,
      name:           p.display_name  || p.name,
      common_name:    p.common_name   || null,
      image:          p.image_path    || null,
      date_of_birth:  p.date_of_birth || null,
      age,
      height:         p.height        || null,
      weight:         p.weight        || null,
      gender:         p.gender        || null,

      position:          player.position          || null,
      detailed_position: p.detailedPosition?.name || null,

      nationality: p.nationality
        ? {
            name:       p.nationality.name       || null,
            flag_image: p.nationality.image_path || null,
          }
        : null,

      current_team: currentTeam?.team
        ? {
            name: currentTeam.team.name       || null,
            logo: currentTeam.team.image_path || null,
          }
        : null,

      trophies,
      recent_matches,
      statistics,
    },
  };
};