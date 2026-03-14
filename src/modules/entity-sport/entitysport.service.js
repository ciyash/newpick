import axios from "axios";
import db from "../../config/db.js";

const TOKEN = process.env.ENTITYSPORT_TOKEN;
const BASE_URL = process.env.ENTITYSPORT_BASE_URL;


/* ===============================
   SERIES
================================ */

export const syncSeriesService = async () => {

  const url = `${BASE_URL}/competitions?token=${TOKEN}`;

  const response = await axios.get(url);

  const series = response.data.response.items;

  for (const s of series) {

    await db.query(
      `INSERT INTO series
      (provider_series_id,name,season)
      VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE
      name=VALUES(name),
      season=VALUES(season)`,
      [
        s.cid,
        s.title,
        s.season
      ]
    );

  }

  return series.length;

};



/* ===============================
   TEAMS
================================ */

export const syncTeamsService = async (seriesId) => {

  const url = `${BASE_URL}/matches?token=${TOKEN}&competition_id=${seriesId}`;

  const response = await axios.get(url);

  const matches = response.data.response.items;

  let count = 0;

  for (const match of matches) {

    const teamA = match.team_a;
    const teamB = match.team_b;

    await db.query(
      `INSERT INTO teams (id,name)
       VALUES (?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name)`,
      [teamA.tid, teamA.title]
    );

    await db.query(
      `INSERT INTO teams (id,name)
       VALUES (?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name)`,
      [teamB.tid, teamB.title]
    );

    count += 2;

  }

  return count;

};



/* ===============================
   MATCHES
================================ */

export const syncMatchesService = async (seriesId) => {

  const url = `${BASE_URL}/matches?token=${TOKEN}&competition_id=${seriesId}`;

  const response = await axios.get(url);

  const matches = response.data.response.items;

  for (const match of matches) {

    await db.query(
      `INSERT INTO matches
      (series_id,home_team_id,away_team_id,start_time,status,matchdate,seriesname,hometeamname,awayteamname)
      VALUES (?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
      status=VALUES(status)`,
      [
        seriesId,
        match.team_a.tid,
        match.team_b.tid,
        match.date_start,
        match.status,
        match.date_start,
        match.competition.title,
        match.team_a.title,
        match.team_b.title
      ]
    );

  }

  return matches.length;

};



/* ===============================
   PLAYERS
================================ */

export const syncPlayersService = async (matchId) => {

  const url = `${BASE_URL}/match-squad?token=${TOKEN}&match_id=${matchId}`;

  const response = await axios.get(url);

  const players = response.data.response.players;

  for (const player of players) {

    await db.query(
      `INSERT INTO players
      (id,team_id,name,player_type,playerimage)
      VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
      name=VALUES(name)`,
      [
        player.pid,
        player.team_id,
        player.title,
        player.playing_role,
        player.image
      ]
    );

  }

  return players.length;

};



/* ===============================
   PLAYING XI
================================ */

export const syncPlayingXIService = async (matchId) => {

  const url = `${BASE_URL}/matches/playing11?token=${TOKEN}&match_id=${matchId}`;

  const response = await axios.get(url);

  const players = response.data.response.players;

  for (const player of players) {

    await db.query(
      `INSERT INTO match_players
      (match_id,player_id,is_playing)
      VALUES (?,?,1)
      ON DUPLICATE KEY UPDATE is_playing=1`,
      [
        matchId,
        player.pid
      ]
    );

  }

  return players.length;

};



/* ===============================
   PLAYER POINTS
================================ */

export const syncPlayerPointsService = async (matchId) => {

  const url = `${BASE_URL}/matches/scorecard?token=${TOKEN}&match_id=${matchId}`;

  const response = await axios.get(url);

  const players = response.data.response.players;

  for (const player of players) {

    await db.query(
      `INSERT INTO player_match_stats
      (match_id,player_id,points)
      VALUES (?,?,?)
      ON DUPLICATE KEY UPDATE points=VALUES(points)`,
      [
        matchId,
        player.pid,
        player.fantasy_points || 0
      ]
    );

  }

  return players.length;

};