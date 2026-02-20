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

    // ✅ 11 players
    if (players.length !== 11) {
      throw new Error("Team must have exactly 11 players");
    }

    // ✅ Unique players
    if (new Set(players).size !== players.length) {
      throw new Error("Duplicate players not allowed");
    }

    // ✅ Captain & VC rules
    if (captainId === viceCaptainId) {
      throw new Error("Captain and VC must be different");
    }

    // 🔎 Check players exist in players table
    const [existing] = await conn.query(
      `SELECT id FROM players WHERE id IN (?)`,
      [players]
    );

    if (existing.length !== players.length) {
      throw new Error("Some players not found");
    }

    // 🧠 Insert user team
    const [teamResult] = await conn.execute(
      `INSERT INTO user_teams
       (user_id, match_id,  locked)
       VALUES (?, ?, 0)`,
      [userId, matchId]
    );

    const teamId = teamResult.insertId;

    // 👥 Insert players
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
      teamId
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

        p.id AS player_id,
        p.name,
        p.playerimage,
        p.player_type,
        p.points,

        utp.is_captain,
        utp.is_vice_captain

     FROM user_teams ut
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
        players: []
      };
    }

    teams[row.team_id].players.push({
      playerId: row.player_id,
      name: row.name,
      image: row.playerimage,
      type: row.player_type,
      points: row.points,
      isCaptain: row.is_captain === 1,
      isViceCaptain: row.is_vice_captain === 1
    });
  }

  return Object.values(teams);
};