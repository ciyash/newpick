import axios from "axios";
import db from "../../config/db.js";

const TOKEN = process.env.ENTITYSPORT_TOKEN;
const BASE_URL = process.env.ENTITYSPORT_BASE_URL; 

/* ===============================
   1️⃣ GET COMPETITIONS
================================ */

export const syncCompetitionsService = async () => {

  const url = `${BASE_URL}/competitions?token=${TOKEN}`;

  const response = await axios.get(url);

  const competitions = response.data.response.items;

  for (const comp of competitions) {

    await db.query(
      `INSERT INTO competitions 
      (entity_competition_id,name,abbr,season,format,status)
      VALUES (?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      status = VALUES(status)`,
      [
        comp.cid,
        comp.title,
        comp.abbr,
        comp.season,
        comp.match_format,
        comp.status
      ]
    );
  }

  return competitions.length;
};


/* ===============================
   2️⃣ GET MATCHES
================================ */

export const syncMatchesService = async (competitionId) => {

  const url = `${BASE_URL}/matches?token=${TOKEN}&competition_id=${competitionId}`;

  const response = await axios.get(url);

  const matches = response.data.response.items;

  for (const match of matches) {

    await db.query(
      `INSERT INTO matches
      (entity_match_id,competition_id,title,status,match_date)
      VALUES (?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
      status = VALUES(status)`,
      [
        match.mid,
        competitionId,
        match.title,
        match.status,
        match.date_start
      ]
    );

  }

  return matches.length;
};


/* ===============================
   3️⃣ GET MATCH SQUAD
================================ */

export const syncMatchSquadService = async (matchId) => {

  const url = `${BASE_URL}/match-squad?token=${TOKEN}&match_id=${matchId}`;

  const response = await axios.get(url);

  const players = response.data.response.players;

  for (const player of players) {

    await db.query(
      `INSERT INTO players
      (entity_player_id,name,role,image_url)
      VALUES (?,?,?,?)
      ON DUPLICATE KEY UPDATE
      name = VALUES(name)`,
      [
        player.pid,
        player.title,
        player.playing_role,
        player.image
      ]
    );

  }

  return players.length;
};