import db from "../../config/db.js";




// export const createTeamService = async (
//   userId,
//   matchId,
//   players,
//   captainId,
//   viceCaptainId
// ) => {

//   const conn = await db.getConnection();

//   try {
//     await conn.beginTransaction();

//     /* ================================
//        1️⃣ BASIC VALIDATIONS
//     ================================= */

//     if (!Array.isArray(players) || players.length !== 11) {
//       throw new Error("Team must have exactly 11 players");
//     }

//     if (new Set(players).size !== players.length) {
//       throw new Error("Duplicate players not allowed");
//     }

//     if (captainId === viceCaptainId) {
//       throw new Error("Captain and VC must be different");
//     }

//     /* ================================
//        2️⃣ CHECK PLAYERS EXIST
//     ================================= */

//     const [existing] = await conn.query(
//       `SELECT id FROM players WHERE id IN (?)`,
//       [players]
//     );

//     if (existing.length !== players.length) {
//       throw new Error("Some players not found");
//     }

//     /* ================================
//        3️⃣ DUPLICATE TEAM CHECK
//     ================================= */

//     const [existingTeams] = await conn.query(
//       `SELECT id FROM user_teams
//        WHERE user_id = ? AND match_id = ?`,
//       [userId, matchId]
//     );

//     for (const team of existingTeams) {

//       const [teamPlayers] = await conn.query(
//         `SELECT player_id, is_captain, is_vice_captain
//          FROM user_team_players
//          WHERE user_team_id = ?`,
//         [team.id]
//       );

//       const existingSet = new Set(
//         teamPlayers.map(p =>
//           `${p.player_id}-${p.is_captain}-${p.is_vice_captain}`
//         )
//       );

//       const newSet = new Set(
//         players.map(id => {
//           const c = id === captainId ? 1 : 0;
//           const v = id === viceCaptainId ? 1 : 0;
//           return `${id}-${c}-${v}`;
//         })
//       );

//       if (
//         existingSet.size === newSet.size &&
//         [...existingSet].every(x => newSet.has(x))
//       ) {
//         throw new Error("Duplicate team not allowed");
//       }
//     }

//     /* ================================
//        🔥 4️⃣ MAX 20 TEAMS CHECK
//     ================================= */

//     const [[count]] = await conn.query(
//       `SELECT COUNT(*) AS total
//        FROM user_teams
//        WHERE user_id = ? AND match_id = ?`,
//       [userId, matchId]
//     );

//     if (count.total >= 20) {
//       throw new Error("Maximum 20 teams allowed per match");
//     }

//     const teamName = `Team ${count.total + 1}`;

//     /* ================================
//        5️⃣ INSERT TEAM
//     ================================= */

//     const [teamResult] = await conn.execute(
//       `INSERT INTO user_teams
//        (user_id, match_id, team_name, locked)
//        VALUES (?, ?, ?, 0)`,
//       [userId, matchId, teamName]
//     );

//     const teamId = teamResult.insertId;

//     /* ================================
//        6️⃣ INSERT TEAM PLAYERS
//     ================================= */

//     for (const playerId of players) {

//       const isCaptain = playerId === captainId ? 1 : 0;
//       const isViceCaptain = playerId === viceCaptainId ? 1 : 0;

//       await conn.execute(
//         `INSERT INTO user_team_players
//          (user_team_id, player_id, is_captain, is_vice_captain)
//          VALUES (?, ?, ?, ?)`,
//         [teamId, playerId, isCaptain, isViceCaptain]
//       );
//     }

//     await conn.commit();

//     return {
//       success: true,
//       message: "Team created successfully",
//       teamId,
//       teamName
//     };

//   } catch (err) {
//     await conn.rollback();
//     throw err;
//   } finally {
//     conn.release();
//   }
// };

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
       0️⃣ MATCH STATUS & DEADLINE CHECK
    ================================= */

    const [[match]] = await conn.query(
      `SELECT status, start_time
       FROM matches
       WHERE id = ?`,
      [matchId]
    );

    if (!match) {
      throw new Error("Match not found");
    }

    const now = new Date();

    // ❌ If match started or completed → block
    // if (
    //   match.status !== "upcoming" ||
    //   now >= new Date(match.start_time)
    // ) {
    //   throw new Error("Team creation closed for this match");
    // }

    /* ================================
       1️⃣ BASIC VALIDATIONS
    ================================= */
 //
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
       3️⃣ DUPLICATE TEAM CHECK
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
       4️⃣ MAX 20 TEAMS CHECK (PER MATCH)
    ================================= */

    const [[count]] = await conn.query(
      `SELECT COUNT(*) AS total
       FROM user_teams
       WHERE user_id = ? AND match_id = ?
       FOR UPDATE`,
      [userId, matchId]
    );

    if (count.total >= 20) {
      throw new Error("Maximum 20 teams allowed per match");
    }

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

export const getMyTeamsMatchIdPlayersService = async (userId, matchId) => {

  const [rows] = await db.query(
    `SELECT 
        ut.id AS team_id,
        ut.team_name,
        ut.match_id,

        p.id AS player_id,
        p.name,
        p.position,
        p.points,
        p.player_type,
        p.playerimage,
        p.team_id AS real_team_id,

        t.name AS real_team_name,
        t.short_name AS real_team_short_name,

        utp.is_captain,
        utp.is_vice_captain

     FROM user_teams ut
     JOIN user_team_players utp ON ut.id = utp.user_team_id
     JOIN players p ON utp.player_id = p.id
     LEFT JOIN teams t ON p.team_id = t.id

     WHERE ut.user_id = ?
     ${matchId ? "AND ut.match_id = ?" : ""}

     ORDER BY ut.created_at DESC`,
    matchId ? [userId, matchId] : [userId]
  );

  if (!rows.length) {
    throw new Error("No teams found");
  }

  const teams = {};

  for (const row of rows) {

    if (!teams[row.team_id]) {
      teams[row.team_id] = {
        teamId: row.team_id,
        teamName: row.team_name,
        matchId: row.match_id,
        captain: null,
        viceCaptain: null,
        players: [],
        totalPlayers: 0,
        realTeamsBreakdown: {}
      };
    }

    const player = {
      playerId: row.player_id,
      name: row.name,
      position: row.position,
      points: row.points,
      playerType: row.player_type,
      image: row.playerimage,
      isCaptain: row.is_captain === 1,
      isViceCaptain: row.is_vice_captain === 1,
      realTeamId: row.real_team_id,
      realTeamName: row.real_team_name,
      realTeamShortName: row.real_team_short_name
    };

    if (player.isCaptain) teams[row.team_id].captain = player;
    if (player.isViceCaptain) teams[row.team_id].viceCaptain = player;

    teams[row.team_id].players.push(player);
    teams[row.team_id].totalPlayers++;

    const rtId = row.real_team_id;

    if (rtId) {
      if (!teams[row.team_id].realTeamsBreakdown[rtId]) {
        teams[row.team_id].realTeamsBreakdown[rtId] = {
          teamId: rtId,
          teamName: row.real_team_name,
          shortName: row.real_team_short_name,
          count: 0
        };
      }
      teams[row.team_id].realTeamsBreakdown[rtId].count++;
    }
  }

  for (const team of Object.values(teams)) {

    team.realTeamsBreakdown = Object.values(team.realTeamsBreakdown);

    if (!team.captain && team.players.length) {
      team.captain = team.players[0];
      team.captain.isCaptain = true;
    }

    if (!team.viceCaptain) {
      const vc = team.players.find(p => !p.isCaptain);
      team.viceCaptain = vc || team.players[1];
      if (team.viceCaptain) team.viceCaptain.isViceCaptain = true;
    }
  }

  return Object.values(teams);
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
        p.position,
        p.points,
        p.player_type,
        p.playerimage,
        p.team_id AS real_team_id,

        t.name AS real_team_name,
        t.short_name AS real_team_short_name,

        utp.is_captain,
        utp.is_vice_captain

     FROM user_teams ut
     JOIN user_team_players utp ON ut.id = utp.user_team_id
     JOIN players p ON utp.player_id = p.id
     LEFT JOIN teams t ON p.team_id = t.id

     WHERE ut.user_id = ?
     ORDER BY ut.created_at DESC`,
    [userId]
  );

  if (!rows.length) {
    throw new Error("No teams found");
  }

  const teams = {};

  for (const row of rows) {

    if (!teams[row.team_id]) {
      teams[row.team_id] = {
        teamId: row.team_id,
        teamName: row.team_name,
        matchId: row.match_id,
        captain: null,
        viceCaptain: null,
        players: [],
        totalPlayers: 0,              // 🔥 NEW
        realTeamsBreakdown: {}
      };
    }

    const player = {
      playerId: row.player_id,
      name: row.name,
      position: row.position,
      points: row.points,
      playerType: row.player_type,
      image: row.playerimage,
      isCaptain: row.is_captain === 1,
      isViceCaptain: row.is_vice_captain === 1,
      realTeamId: row.real_team_id,
      realTeamName: row.real_team_name,
      realTeamShortName: row.real_team_short_name
    };

    if (player.isCaptain) {
      teams[row.team_id].captain = player;
    }

    if (player.isViceCaptain) {
      teams[row.team_id].viceCaptain = player;
    }

    teams[row.team_id].players.push(player);

    /* 🔥 TOTAL PLAYERS COUNT */
    teams[row.team_id].totalPlayers++;

    /* 🔥 REAL TEAM COUNT */

    const rtId = row.real_team_id;

    if (rtId) {
      if (!teams[row.team_id].realTeamsBreakdown[rtId]) {
        teams[row.team_id].realTeamsBreakdown[rtId] = {
          teamId: rtId,
          teamName: row.real_team_name,
          shortName: row.real_team_short_name,
          count: 0
        };
      }

      teams[row.team_id].realTeamsBreakdown[rtId].count++;
    }
  }

  /* 🔥 Convert breakdown object → array */

  for (const team of Object.values(teams)) {

    team.realTeamsBreakdown = Object.values(team.realTeamsBreakdown);

    // Captain fallback
    if (!team.captain && team.players.length) {
      team.captain = team.players[0];
      team.captain.isCaptain = true;
    }

    // Vice Captain fallback
    if (!team.viceCaptain) {
      const vc = team.players.find(p => !p.isCaptain);
      team.viceCaptain = vc || team.players[1];
      if (team.viceCaptain) {
        team.viceCaptain.isViceCaptain = true;
      }
    }
  }

  return Object.values(teams);
};   


export const updateTeamService = async (
  userId,
  teamId,
  { players, captainId, viceCaptainId, teamName }
) => {

  let conn;

  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    /* ✅ Team exists & belongs to user check */

    const [[team]] = await conn.query(
      `SELECT id FROM user_teams WHERE id = ? AND user_id = ?`,
      [teamId, userId]
    );

    if (!team) throw new Error("Team not found or not yours");

    /* ✅ Players validation */

    if (!players || players.length !== 11) {
      throw new Error("Team must have exactly 11 players");
    }

    if (!players.includes(captainId) || !players.includes(viceCaptainId)) {
      throw new Error("Captain/VC must be in selected players");
    }

    if (captainId === viceCaptainId) {
      throw new Error("Captain and Vice Captain cannot be same");
    }

    /* 🔥 Update team name */

    if (teamName) {
      await conn.query(
        `UPDATE user_teams SET team_name = ? WHERE id = ?`,
        [teamName, teamId]
      );
    }

    /* 🔥 Delete old players */

    await conn.query(
      `DELETE FROM user_team_players WHERE user_team_id = ?`,
      [teamId]
    );

    /* 🔥 Insert updated players */

    for (const playerId of players) {

      await conn.query(
        `INSERT INTO user_team_players
         (user_team_id, player_id, is_captain, is_vice_captain)
         VALUES (?, ?, ?, ?)`,
        [
          teamId,
          playerId,
          playerId === captainId ? 1 : 0,
          playerId === viceCaptainId ? 1 : 0
        ]
      );
    }

    await conn.commit();

    return { message: "Team updated successfully" };

  } catch (error) {
    if (conn) await conn.rollback();
    throw error;
  } finally {
    if (conn) conn.release();
  }
};