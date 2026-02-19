import db from "../../config/db.js";



export const createTeamService = async (
  userId,
  matchId,
  teamName,
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
       (user_id, match_id, team_name, locked)
       VALUES (?, ?, ?, 0)`,
      [userId, matchId, teamName]
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



export const getTeamPlayersService = async (teamId) => {

  const [rows] = await db.query(
    `SELECT 
        p.id,
        p.name,
        p.playerimage,
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
