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
//        0️⃣ MATCH CHECK
//     ================================= */

//     const [[match]] = await conn.query(
//       `SELECT status, start_time
//        FROM matches
//        WHERE id = ?`,
//       [matchId]
//     );

//     if (!match) {
//       throw new Error("Match not found");
//     }

//     // ✅ Normalized to lowercase — handles "UPCOMING", "Upcoming", "upcoming"
//     const now = new Date();
//     const matchStatus = match.status?.trim().toLowerCase();
//     if (matchStatus !== "upcoming" || now >= new Date(match.start_time)) {
//       throw new Error("Team creation is closed for this match");
//     }

//     /* ================================
//        1️⃣ FETCH PLAYERS & ROLES
//           Validate all player IDs exist and
//           grab their position in one query
//     ================================= */

//     const [playersData] = await conn.query(
//       `SELECT id AS player_id, position AS role
//        FROM players
//        WHERE id IN (?)`,
//       [players]
//     );

//     if (playersData.length !== players.length) {
//       throw new Error("One or more players do not exist");
//     }

//     // Build a map of playerId → role for quick lookup
//     const playerRoleMap = Object.fromEntries(
//       playersData.map(({ player_id, role }) => [player_id, role])
//     );

//     /* ================================
//        2️⃣ TEAM SIGNATURE
//     ================================= */

//     const sortedPlayers = [...players].sort((a, b) => a - b);

//     const teamSignature =
//       sortedPlayers.join(",") +
//       `|C${captainId}|VC${viceCaptainId}`;

//     /* ================================
//        3️⃣ MAX 20 TEAMS CHECK
//           Lock actual rows (not COUNT) to prevent
//           race condition with concurrent requests
//     ================================= */

//     const [existingTeams] = await conn.query(
//       `SELECT id
//        FROM user_teams
//        WHERE user_id = ? AND match_id = ?
//        FOR UPDATE`,
//       [userId, matchId]
//     );

//     if (existingTeams.length >= 20) {
//       throw new Error("Maximum 20 teams allowed per match");
//     }

//     const teamName = `Team ${existingTeams.length + 1}`;

//     /* ================================
//        4️⃣ INSERT TEAM
//           teamSignature unique constraint is the
//           final DB-level guard against duplicates
//     ================================= */

//     let teamId;

//     try {

//       const [teamResult] = await conn.execute(
//         `INSERT INTO user_teams
//          (user_id, match_id, team_name, team_signature, locked)
//          VALUES (?, ?, ?, ?, 0)`,
//         [userId, matchId, teamName, teamSignature]
//       );

//       teamId = teamResult.insertId;

//     } catch (err) {

//       if (err.code === "ER_DUP_ENTRY") {
//         throw new Error("Duplicate team not allowed");
//       }

//       throw err;
//     }

//     /* ================================
//        5️⃣ BULK INSERT TEAM PLAYERS
//           Includes role fetched from players table —
//           single query, atomic, no loop
//     ================================= */

//     const playerRows = players.map((playerId) => [
//       teamId,
//       playerId,
//       playerRoleMap[playerId] ?? null,
//       playerId === captainId ? 1 : 0,
//       playerId === viceCaptainId ? 1 : 0,
//     ]);

//     try {

//       await conn.query(
//         `INSERT INTO user_team_players
//          (user_team_id, player_id, role, is_captain, is_vice_captain)
//          VALUES ?`,
//         [playerRows]
//       );

//     } catch (err) {

//       if (err.code === "ER_NO_REFERENCED_ROW_2") {
//         throw new Error("One or more players do not exist");
//       }

//       throw err;
//     }

//     await conn.commit();

//     return {
//       success: true,
//       message: "Team created successfully",
//       teamId,
//       teamName,
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
       0️⃣ MATCH CHECK
    ================================= */
    const [[match]] = await conn.query(
      `SELECT status, start_time FROM matches WHERE id = ?`,
      [matchId]
    );

    if (!match) throw new Error("Match not found");

    const now         = new Date();
    const matchStatus = match.status?.trim().toLowerCase();

    if (matchStatus !== "upcoming" || now >= new Date(match.start_time)) {
      throw new Error("Team creation is closed for this match");
    }

    /* ================================
       1️⃣ FETCH PLAYERS & ROLES
    ================================= */
    const [playersData] = await conn.query(
      `SELECT id AS player_id, position AS role FROM players WHERE id IN (?)`,
      [players]
    );

    if (playersData.length !== players.length) {
      throw new Error("One or more players do not exist");
    }

    const playerRoleMap = Object.fromEntries(
      playersData.map(({ player_id, role }) => [player_id, role])
    );

    /* ================================
       2️⃣ TEAM SIGNATURE
    ================================= */
    const sortedPlayers = [...players].sort((a, b) => a - b);
    const teamSignature = sortedPlayers.join(",") + `|C${captainId}|VC${viceCaptainId}`;

    /* ================================
       3️⃣ MAX 20 TEAMS CHECK
    ================================= */
    const [existingTeams] = await conn.query(
      `SELECT id FROM user_teams WHERE user_id = ? AND match_id = ? FOR UPDATE`,
      [userId, matchId]
    );

    if (existingTeams.length >= 20) {
      throw new Error("Maximum 20 teams allowed per match");
    }

    const teamName = `Team ${existingTeams.length + 1}`;

    /* ================================
       4️⃣ INSERT TEAM
    ================================= */
    let teamId;

    try {
      const [teamResult] = await conn.execute(
        `INSERT INTO user_teams
           (user_id, match_id, team_name, team_signature, locked)
         VALUES (?, ?, ?, ?, 0)`,
        [userId, matchId, teamName, teamSignature]
      );
      teamId = teamResult.insertId;
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") throw new Error("Duplicate team not allowed");
      throw err;
    }

    /* ================================
       5️⃣ BULK INSERT TEAM PLAYERS
    ================================= */
    const playerRows = players.map((playerId) => [
      teamId,
      playerId,
      playerRoleMap[playerId] ?? null,
      playerId === captainId ? 1 : 0,
      playerId === viceCaptainId ? 1 : 0,
    ]);

    try {
      await conn.query(
        `INSERT INTO user_team_players
           (user_team_id, player_id, role, is_captain, is_vice_captain)
         VALUES ?`,
        [playerRows]
      );
    } catch (err) {
      if (err.code === "ER_NO_REFERENCED_ROW_2") {
        throw new Error("One or more players do not exist");
      }
      throw err;
    }

    /* ================================
       6️⃣ UPDATE PLAYER PERCENTAGES
    ================================= */
    const [[{ totalTeams }]] = await conn.query(
      `SELECT COUNT(*) as totalTeams FROM user_teams WHERE match_id = ?`,
      [matchId]
    );

    if (totalTeams > 0) {
      await conn.query(
        `UPDATE players p
         SET
           selectpercent = ROUND(
             (SELECT COUNT(*) FROM user_team_players utp
              JOIN user_teams ut ON ut.id = utp.user_team_id
              WHERE utp.player_id = p.id AND ut.match_id = ?) / ? * 100, 2),
           captainper = ROUND(
             (SELECT COUNT(*) FROM user_team_players utp
              JOIN user_teams ut ON ut.id = utp.user_team_id
              WHERE utp.player_id = p.id AND ut.match_id = ? AND utp.is_captain = 1) / ? * 100, 2),
           vcper = ROUND(
             (SELECT COUNT(*) FROM user_team_players utp
              JOIN user_teams ut ON ut.id = utp.user_team_id
              WHERE utp.player_id = p.id AND ut.match_id = ? AND utp.is_vice_captain = 1) / ? * 100, 2)
         WHERE p.id IN (?)`,
        [matchId, totalTeams, matchId, totalTeams, matchId, totalTeams, players]
      );
    }

    await conn.commit();

    return {
      success: true,
      message:  "Team created successfully",
      teamId,
      teamName,
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

export const getMyTeamsWithPlayersService = async (userId, matchId) => {

  // ✅ Fetch match data
  const [matchRows] = await db.query(
    `SELECT id, lineup_status, lineupavailable, is_active 
     FROM matches 
     WHERE id = ?`,
    [matchId]
  );

  const matchData = matchRows.length
    ? {
        matchId: matchRows[0].id,
        lineupStatus: matchRows[0].lineup_status,
        lineupAvailable: matchRows[0].lineupavailable,
        isActive: matchRows[0].is_active
      }
    : null;

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
        utp.is_vice_captain,

        CASE 
          WHEN mp.player_id IS NOT NULL THEN 1 
          ELSE 0 
        END AS is_in_match

     FROM user_teams ut
     JOIN user_team_players utp ON ut.id = utp.user_team_id
     JOIN players p ON utp.player_id = p.id
     LEFT JOIN teams t ON p.team_id = t.id
     LEFT JOIN match_players mp 
        ON mp.player_id = p.id 
        AND mp.match_id = ut.match_id

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
        match: matchData,          // ✅ match data attached here
        captain: null,
        viceCaptain: null,
        players: [],
        totalPlayers: 0,
        realTeamsBreakdown: {},
        playersNotInMatch: 0
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
      realTeamShortName: row.real_team_short_name,
      isInMatch: row.is_in_match === 1
    };

    if (player.isCaptain) teams[row.team_id].captain = player;
    if (player.isViceCaptain) teams[row.team_id].viceCaptain = player;

    teams[row.team_id].players.push(player);
    teams[row.team_id].totalPlayers++;

    if (!player.isInMatch) {
      teams[row.team_id].playersNotInMatch++;
    }

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
export const getMyTeamsWithPlayersServiceold = async (
  userId,
  matchId,
  contestId = null
) => {

  let filterCondition = `
    ut.user_id = ?
    AND ut.match_id = ?
  `;

  let params = [userId, matchId];

  /* 🔥 Contest filtering */
  if (contestId) {
    filterCondition += `
      AND ut.id NOT IN (
        SELECT user_team_id
        FROM contest_entries
        WHERE contest_id = ?
        AND user_id = ?
      )
    `;
    params.push(contestId, userId);
  }

  const [rows] = await db.query(
    `SELECT 
        ut.id AS team_id,
        ut.team_name,
        ut.match_id,

        p.id AS player_id,
        p.name,
        p.position,
        p.points,
        p.playercredits,
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

     WHERE ${filterCondition}

     ORDER BY ut.created_at DESC`,
    params
  );

  if (!rows.length) {
    return [];
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
      credits: row.playercredits,
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
    teams[row.team_id].totalPlayers++;

    /* 🔥 Real team breakdown */

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

    /* Captain fallback */
    if (!team.captain && team.players.length) {
      team.captain = team.players[0];
      team.captain.isCaptain = true;
    }

    /* Vice captain fallback */
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



export const getMyTeamsXIStatusService = async (userId, matchId, homeTeamId) => {

  // 1️⃣ Match fetch
  const [[match]] = await db.query(
    `SELECT id, lineup_status, home_team_id, away_team_id
     FROM matches WHERE id = ? LIMIT 1`,
    [matchId]
  );
  if (!match) throw new Error("Match not found");

  // 2️⃣ Playing XI fetch — both teams
  const [playingXI] = await db.query(
    `SELECT mp.player_id, p.team_id
     FROM match_players mp
     JOIN players p ON mp.player_id = p.id
     WHERE mp.match_id = ? AND mp.is_playing = 1`,
    [match.id]
  );

  // 3️⃣ Home / Away XI split
  const homeXISet = new Set(
    playingXI.filter(p => p.team_id === homeTeamId).map(p => p.player_id)
  );
  const awayXISet = new Set(
    playingXI.filter(p => p.team_id !== homeTeamId).map(p => p.player_id)
  );

  const homeXIAnnounced = homeXISet.size > 0;
  const awayXIAnnounced = awayXISet.size > 0;

  // 4️⃣ Pre-squad fetch — both teams
  const [preSquad] = await db.query(
    `SELECT mp.player_id
     FROM match_players mp
     WHERE mp.match_id = ? AND mp.is_pre_squad = 1`,
    [match.id]
  );
  const preSquadSet = new Set(preSquad.map(p => p.player_id));

  // 5️⃣ User teams + players fetch
  const [rows] = await db.query(
    `SELECT 
        ut.id           AS team_id,
        ut.team_name,
        p.id            AS player_id,
        p.name,
        p.position,
        p.playerimage,
        p.playercredits,
        p.team_id       AS real_team_id,
        t.name          AS real_team_name,
        t.short_name    AS real_team_short,
        utp.is_captain,
        utp.is_vice_captain
     FROM user_teams ut
     JOIN user_team_players utp ON ut.id = utp.user_team_id
     JOIN players p ON utp.player_id = p.id
     LEFT JOIN teams t ON p.team_id = t.id
     WHERE ut.user_id = ? AND ut.match_id = ?
     ORDER BY ut.id ASC`,
    [userId, matchId]
  );

  if (!rows.length) return [];

  // 6️⃣ Group by user team + xiStatus calculate
  const teamsMap = {};

  for (const row of rows) {
    if (!teamsMap[row.team_id]) {
      teamsMap[row.team_id] = {
        teamId:          row.team_id,
        teamName:        row.team_name,
        lineupStatus:    match.lineup_status,
        homeXIAnnounced,
        awayXIAnnounced,
        totalPlayers:    0,
        playingCount:    0,
        missingCount:    0,
        players:         []
      };
    }

    // 7️⃣ Home player or Away player?
    const isHomePlayer      = row.real_team_id === homeTeamId;
    const isInXI            = isHomePlayer ? homeXISet.has(row.player_id) : awayXISet.has(row.player_id);
    const isInPreSquad      = preSquadSet.has(row.player_id);
    const isMyTeamAnnounced = isHomePlayer ? homeXIAnnounced : awayXIAnnounced;

    // 8️⃣ xiStatus decide
    let xiStatus;
    if (!isMyTeamAnnounced) {
      xiStatus = "not_announced";   // ⏳ XI రాలేదు
    } else if (isInXI) {
      xiStatus = "playing";         // ✅ Playing XI లో ఉన్నాడు
    } else {
      xiStatus = "not_playing";     // ❌ Bench / Out
    }

    // 9️⃣ Player object
    const player = {
      playerId:        row.player_id,
      name:            row.name,
      position:        row.position,
      image:           row.playerimage,
      credits:         Number(row.playercredits) || 0,
      realTeamId:      row.real_team_id,
      realTeamName:    row.real_team_name,
      realTeamShort:   row.real_team_short,
      isCaptain:       row.is_captain === 1,
      isViceCaptain:   row.is_vice_captain === 1,
      isInPlayingXI:   isInXI,
      isInPreSquad:    isInPreSquad,
      xiStatus,
    };

    teamsMap[row.team_id].players.push(player);
    teamsMap[row.team_id].totalPlayers++;

    if (isInXI)                  teamsMap[row.team_id].playingCount++;
    else if (isMyTeamAnnounced)  teamsMap[row.team_id].missingCount++;
  }

  // 🔟 Return all user teams as array
  return Object.values(teamsMap);
};



/* ══════════════════════════════════════════
   GET PLAYING XI
══════════════════════════════════════════ */

export const getPlayingXIService = async (matchId) => {
  const [[match]] = await db.query(
    `SELECT id, hometeamname, awayteamname, lineup_status, lineupavailable
     FROM matches
     WHERE provider_match_id = ? OR id = ?
     LIMIT 1`,
    [matchId, matchId]
  );

  if (!match) throw new Error("Match not found: " + matchId);

  const [players] = await db.query(
    `SELECT 
       mp.id AS match_player_id,
       mp.is_playing,
       mp.is_substitute,
       mp.is_pre_squad,
       p.id AS player_id,
       p.name,
       p.position,
       p.playercredits,
       p.playerimage,
       p.flag_image,
       p.country,
       t.id AS team_id,
       t.name AS team_name
     FROM match_players mp
     JOIN players p ON p.id = mp.player_id
     JOIN teams t ON t.id = mp.team_id
     WHERE mp.match_id = ?
     ORDER BY mp.team_id, mp.is_playing DESC, p.position`,
    [match.id]
  );

  // Split home and away
  const homeTeamName = match.hometeamname;
  const awayTeamName = match.awayteamname;

  const homePlayers = players.filter(p => p.team_name === homeTeamName);
  const awayPlayers = players.filter(p => p.team_name === awayTeamName);

  return {
    success: true,
    data: {
      match_id: matchId,
      lineup_status: match.lineup_status,
      lineupavailable: match.lineupavailable === 1,
      home: {
        team_name: homeTeamName,
        playing_xi: homePlayers.filter(p => p.is_playing === 1),
        substitutes: homePlayers.filter(p => p.is_substitute === 1),
      },
      away: {
        team_name: awayTeamName,
        playing_xi: awayPlayers.filter(p => p.is_playing === 1),
        substitutes: awayPlayers.filter(p => p.is_substitute === 1),
      },
    },
  };
};

export const getTeamComparisonService = async (userTeamId, userId) => {
  // ═══════════════════════════════════════
  // 1) GET USER TEAM
  // ═══════════════════════════════════════
  const [[userTeam]] = await db.query(
    `SELECT id, user_id, match_id, team_name, locked, created_at
     FROM user_teams
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [userTeamId, userId]
  );

  if (!userTeam) throw new Error("Team not found");

  // ═══════════════════════════════════════
  // 2) GET USER TEAM PLAYERS
  // ═══════════════════════════════════════
  const [userTeamPlayers] = await db.query(
    `SELECT
       utp.player_id,
       utp.is_captain,
       utp.is_vice_captain,
       utp.is_substitude,
       utp.role,
       utp.points,
       p.name          AS player_name,
       p.position,
       p.playerimage   AS player_image,
       p.flag_image,
       p.playercredits,
       p.country,
       t.name          AS team_name,
       t.id            AS team_id
     FROM user_team_players utp
     JOIN players p ON p.id = utp.player_id
     JOIN teams t ON t.id = p.team_id
     WHERE utp.user_team_id = ?`,
    [userTeamId]
  );

  // ═══════════════════════════════════════
  // 3) GET MATCH PLAYING XI FROM match_players
  // ═══════════════════════════════════════
  const [lineupPlayers] = await db.query(
    `SELECT
       mp.player_id,
       mp.is_playing,
       mp.is_substitute,
       mp.team_id,
       p.name          AS player_name,
       p.position,
       p.playerimage   AS player_image,
       p.flag_image,
       p.playercredits,
       p.country,
       t.name          AS team_name
     FROM match_players mp
     JOIN players p ON p.id = mp.player_id
     JOIN teams t ON t.id = mp.team_id
     WHERE mp.match_id = ?
       AND (mp.is_playing = 1 OR mp.is_substitute = 1)`,
    [userTeam.match_id]
  );

  // ═══════════════════════════════════════
  // 4) COMPARE
  // ═══════════════════════════════════════
  const userPlayerIds  = new Set(userTeamPlayers.map(p => p.player_id));
  const lineupPlayerIds = new Set(lineupPlayers.map(p => p.player_id));

  // My team players NOT in lineup
  const myTeamNotInLineup = userTeamPlayers.filter(
    p => !lineupPlayerIds.has(p.player_id)
  );

  // Lineup players NOT in my team
  const lineupNotInMyTeam = lineupPlayers.filter(
    p => !userPlayerIds.has(p.player_id)
  );

  return {
    success: true,
    data: {
      // 1) My team info
      my_team: {
        team_id:   userTeam.id,
        team_name: userTeam.team_name,
        match_id:  userTeam.match_id,
        locked:    userTeam.locked === 1,
        players:   userTeamPlayers.map(p => ({
          player_id:     p.player_id,
          player_name:   p.player_name,
          position:      p.position,
          player_image:  p.player_image,
          flag_image:    p.flag_image,
          playercredits: p.playercredits,
          country:       p.country,
          team_name:     p.team_name,
          team_id:       p.team_id,
          is_captain:      p.is_captain === 1,
          is_vice_captain: p.is_vice_captain === 1,
          is_substitute:   p.is_substitude === 1,
          role:            p.role,
          points:          Number(p.points) || 0,
        })),
      },

      // 2) Match playing XI + subs
      lineup: {
        match_id: userTeam.match_id,
        players:  lineupPlayers.map(p => ({
          player_id:     p.player_id,
          player_name:   p.player_name,
          position:      p.position,
          player_image:  p.player_image,
          flag_image:    p.flag_image,
          playercredits: p.playercredits,
          country:       p.country,
          team_name:     p.team_name,
          team_id:       p.team_id,
          is_playing:    p.is_playing === 1,
          is_substitute: p.is_substitute === 1,
        })),
      },

      // 3) My team players NOT in lineup
      my_team_not_in_lineup: myTeamNotInLineup.map(p => ({
        player_id:    p.player_id,
        player_name:  p.player_name,
        position:     p.position,
        player_image: p.player_image,
        team_name:    p.team_name,
      })),

      // 4) Lineup players NOT in my team
      lineup_not_in_my_team: lineupNotInMyTeam.map(p => ({
        player_id:     p.player_id,
        player_name:   p.player_name,
        position:      p.position,
        player_image:  p.player_image,
        team_name:     p.team_name,
        is_playing:    p.is_playing === 1,
        is_substitute: p.is_substitute === 1,
      })),
    },
  };
};