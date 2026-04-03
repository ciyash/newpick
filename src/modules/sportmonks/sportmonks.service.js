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

// ✅ FIX 1: Sportmonks state_id complete mapping
const mapStatus = (stateId) => {
  switch (stateId) {
    case 1:                            return "UPCOMING"; // Not started
    case 2:  case 3:  case 4:
    case 6:  case 7:  case 8:
    case 9:  case 10: case 11:
    case 13: case 14: case 15:        return "LIVE";     // All live/inplay states
    case 5:                            return "RESULT";   // Finished
    default:                           return "UPCOMING";
  }
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

  // ✅ FIX 2: Only fetch fixtures for active series league IDs — not all fixtures
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

    // Filter only fixtures belonging to active series
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

    // ✅ timestamp → UTC datetime
    const startTimeUTC = toUTCDateTime(f.starting_at_timestamp, f.starting_at);

    return {
      match_id:   String(f.id),
      home:       home?.name        || "",
      home_image: home?.image_path  || null,
      away:       away?.name        || "",
      away_image: away?.image_path  || null,
      start_time: startTimeUTC,     // ✅ UTC
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
   //

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

    if (!fixture) {
      results.push({ match_id: matchId, error: "Match not found in API" });
      continue;
    }

    const home      = fixture.participants?.find((p) => p.meta?.location === "home");
    const away      = fixture.participants?.find((p) => p.meta?.location === "away");
    const lookupCid = seriesId ? String(seriesId) : String(fixture.league_id);

    const [[seriesRow]] = await db.query(
      `SELECT id, seriesid FROM series WHERE seriesid = ? LIMIT 1`,
      [lookupCid]
    );

    if (!seriesRow) {
      results.push({ match_id: matchId, error: "Series not active — toggle ON చేయి ముందు" });
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
    // ✅ starting_at already UTC — directly use చేయి
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
        startingAt,       // ✅ UTC datetime directly
        mapStatus(fixture.state_id),
        fixture.league?.name || "",
        home?.name || "",
        away?.name || "",
        matchDateOnly,    // ✅ date only
      ]
    );

    // ✅ players table కి squad sync
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
      note:       "Match added + squad synced to players table. Playing XI via cron after lineup announced.",
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
    // ✅ FIX 4: Sportmonks v3 include syntax — semicolon separator
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

      // ✅ FIX 5: All possible position paths covered
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

      // ✅ players table ONLY — match_players touch చేయడం లేదు
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

  console.log(`✅ Players synced to players table for match ${matchId}: ${totalInserted}`);
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
    pid:           String(l.player_id),
    is_substitute: l.type_id === 12 ? 1 : 0,
    // ✅ FIX 6: Store provider team_id to match with players table
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
        player.team_id,           // DB internal team_id from players table
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

  console.log(`✅ Playing XI synced: ${count} players for match ${matchId}`);
  return { count, reason: null, type: "lineup" };
};

/* ══════════════════════════════════════════
   PLAYER POINTS
══════════════════════════════════════════ */

export const syncPlayerPointsService = async (matchId) => {
  const [[matchRow]] = await db.query(
    `SELECT id, provider_match_id, status FROM matches
     WHERE provider_match_id = ? LIMIT 1`,
    [matchId]
  );
  if (!matchRow) throw new Error("Match not found: " + matchId);

  if (matchRow.status !== "RESULT") {
    return { count: 0, reason: `Match not completed yet (status: ${matchRow.status})` };
  }

  const data    = await apiGet(`/fixtures/${matchId}`, { include: "players" });
  const players = data?.data?.players || [];

  if (!players.length) {
    return { count: 0, reason: "No player stats in API response" };
  }

  const pids = [...new Set(players.map((p) => String(p.player_id)))];
  const [playerRows] = await db.query(
    `SELECT id, provider_player_id FROM players WHERE provider_player_id IN (?)`,
    [pids]
  );
  const playerMap = new Map(playerRows.map((r) => [r.provider_player_id, r.id]));

  let count = 0;
  for (const p of players) {
    const internalId = playerMap.get(String(p.player_id));
    if (!internalId) continue;

    await db.query(
      `INSERT INTO player_match_stats (match_id, player_id, points)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE points = VALUES(points)`,
      [matchRow.id, internalId, p.fantasy_points || 0]
    );
    count++;
  }

  return { count, reason: null };
};