import db from "../../config/db.js";



export const createTeamService = async (
  userId,
  matchId,
  players,
  captainId,
  viceCaptainId
) => {

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    /* ================================
       1️⃣ BASIC VALIDATIONS
    ================================= */

    if (!Array.isArray(players) || players.length !== 11) {
      throw new Error("Team must have exactly 11 players");
    }

    if (new Set(players).size !== players.length) {
      throw new Error("Duplicate players not allowed");
    }

    if (captainId === viceCaptainId) {
      throw new Error("Captain and VC must be different");
    }

    /* ================================
       2️⃣ CHECK PLAYERS EXIST
    ================================= */

    const [existing] = await conn.query(
      `SELECT id FROM players WHERE id IN (?)`,
      [players]
    );

    if (existing.length !== players.length) {
      throw new Error("Some players not found");
    }

    /* ================================
       3️⃣ DUPLICATE TEAM CHECK 🔥
    ================================= */

    const [existingTeams] = await conn.query(
      `SELECT id FROM user_teams
       WHERE user_id = ? AND match_id = ?`,
      [userId, matchId]
    );

    for (const team of existingTeams) {

      const [teamPlayers] = await conn.query(
        `SELECT player_id, is_captain, is_vice_captain
         FROM user_team_players
         WHERE user_team_id = ?`,
        [team.id]
      );

      const existingSet = new Set(
        teamPlayers.map(p =>
          `${p.player_id}-${p.is_captain}-${p.is_vice_captain}`
        )
      );

      const newSet = new Set(
        players.map(id => {
          const c = id === captainId ? 1 : 0;
          const v = id === viceCaptainId ? 1 : 0;
          return `${id}-${c}-${v}`;
        })
      );

      if (
        existingSet.size === newSet.size &&
        [...existingSet].every(x => newSet.has(x))
      ) {
        throw new Error("Duplicate team not allowed");
      }
    }

    /* ================================
       4️⃣ AUTO TEAM NAME
    ================================= */

    const [[count]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM user_teams
       WHERE user_id = ? AND match_id = ?`,
      [userId, matchId]
    );

    const teamName = `Team ${count.total + 1}`;

    /* ================================
       5️⃣ INSERT TEAM
    ================================= */

    const [teamResult] = await conn.execute(
      `INSERT INTO user_teams
       (user_id, match_id, team_name, locked)
       VALUES (?, ?, ?, 0)`,
      [userId, matchId, teamName]
    );

    const teamId = teamResult.insertId;

    /* ================================
       6️⃣ INSERT TEAM PLAYERS
    ================================= */

    for (const playerId of players) {

      const isCaptain = playerId === captainId ? 1 : 0;
      const isViceCaptain = playerId === viceCaptainId ? 1 : 0;

      await conn.execute(
        `INSERT INTO user_team_players
         (user_team_id, player_id, is_captain, is_vice_captain)
         VALUES (?, ?, ?, ?)`,
        [teamId, playerId, isCaptain, isViceCaptain]
      );
    }

    await conn.commit();

    return {
      success: true,
      message: "Team created successfully",
      teamId,
      teamName
    };

  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};


export const getMyTeamsService = async (userId, matchId) => {

  const [rows] = await db.query(
    `SELECT *
     FROM user_teams
     WHERE user_id = ? AND match_id = ?
     ORDER BY created_at DESC`,
    [userId, matchId]
  );

  return rows;
};


//
export const getTeamPlayersService = async (teamId) => {

  const [rows] = await db.query(
    `SELECT 
        p.id,
        p.name,
        p.playerimage,
          p.points,           
        p.player_type,
        utp.is_captain,
        utp.is_vice_captain
     FROM user_team_players utp
     JOIN players p ON utp.player_id = p.id
     WHERE utp.user_team_id = ?`,
    [teamId]
  );

  return rows;
};



export const getMyTeamsWithPlayersService = async (userId) => {

  const [rows] = await db.query(
    `SELECT 
        ut.id AS team_id,
        ut.team_name,
        ut.match_id,

        u.nickname,

        p.*,  -- 🔥 ALL PLAYER FIELDS

        utp.is_captain,
        utp.is_vice_captain

     FROM user_teams ut
     JOIN users u ON ut.user_id = u.id
     JOIN user_team_players utp ON ut.id = utp.user_team_id
     JOIN players p ON utp.player_id = p.id

     WHERE ut.user_id = ?
     ORDER BY ut.id`,
    [userId]
  );

  /* 🔥 Group players by team */

  const teams = {};

  for (const row of rows) {

    if (!teams[row.team_id]) {
      teams[row.team_id] = {
        teamId: row.team_id,
        teamName: row.team_name,
        matchId: row.match_id,
        nickname: row.nickname || null,
        players: []
      };
    }

    teams[row.team_id].players.push({
      playerId: row.id,
      teamId: row.team_id,
      name: row.name,
      position: row.position,
      createdAt: row.created_at,
      points: row.points,
      playerType: row.player_type,
      image: row.playerimage,
      credits: row.playercredits,
      selectPercent: row.selectpercent,
      captainPercent: row.captainper,
      viceCaptainPercent: row.vcper,
      isCaptain: row.is_captain === 1,
      isViceCaptain: row.is_vice_captain === 1
    });
  }

  return Object.values(teams);
};

