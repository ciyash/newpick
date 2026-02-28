// import db from '../../config/db.js';


// export const generateUCTTeamsService = async (userId, data) => {
//   try {

//     const {
//       matchId,
//       mode,
//       mandateYes = [],
//       mandateNo = [],
//       captainPool = [],
//       viceCaptainPool = []
//     } = data;

//     console.log("🔥 UCT Request:", data);

//     // 🚨 Validate conflict
//     if (mandateYes.some(id => mandateNo.includes(id))) {
//       throw new Error("Mandate YES and NO cannot overlap");
//     }

//     if (mode === "CVC" && (!captainPool.length || !viceCaptainPool.length)) {
//       throw new Error("Captain and VC pools required for CVC mode");
//     }

//     // 🧠 STEP 1 — Get match teams
//     const [[match]] = await db.query(
//       `SELECT home_team_id, away_team_id
//        FROM matches
//        WHERE id = ?`,
//       [matchId]
//     );

//     if (!match) throw new Error("Match not found");

//     console.log("🏟 Match teams:", match);

//     // 🧠 STEP 2 — Get players of both teams
//     const [players] = await db.query(
//       `SELECT id, position AS role, team_id
//        FROM players
//        WHERE team_id IN (?, ?)`,
//       [match.home_team_id, match.away_team_id]
//     );

//     console.log("👥 Players fetched:", players.length);

//     if (!players.length) throw new Error("No players found");

//     // ❌ Remove Mandate NO players
//     const availablePlayers = players.filter(
//       p => !mandateNo.includes(p.id)
//     );

//     console.log("✅ Available players:", availablePlayers.length);

//     const teams = [];

//     // 🔥 Generate 20 teams
//     for (let i = 0; i < 20; i++) {

//       const teamPlayers = [];
//       const roleCount = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
//       const teamCount = {};

//       // ⭐ Add Mandate YES players first
//       mandateYes.forEach(pid => {
//         const p = availablePlayers.find(pl => pl.id === pid);
//         if (p) {
//           teamPlayers.push(p);
//           roleCount[p.role]++;
//           teamCount[p.team_id] = (teamCount[p.team_id] || 0) + 1;
//         }
//       });

//       let attempts = 0;

//       // ⭐ Fill remaining players
//       while (teamPlayers.length < 11 && attempts < 500) {
//         attempts++;

//         const random =
//           availablePlayers[Math.floor(Math.random() * availablePlayers.length)];

//         if (teamPlayers.find(p => p.id === random.id)) continue;

//         // Role limits (Football)
//         if (random.role === "GK" && roleCount.GK >= 1) continue;
//         if (random.role === "DEF" && roleCount.DEF >= 6) continue;
//         if (random.role === "MID" && roleCount.MID >= 5) continue;
//         if (random.role === "FWD" && roleCount.FWD >= 3) continue;

//         // Max 8 from same real team
//         if ((teamCount[random.team_id] || 0) >= 8) continue;

//         teamPlayers.push(random);
//         roleCount[random.role]++;
//         teamCount[random.team_id] =
//           (teamCount[random.team_id] || 0) + 1;
//       }

//       if (teamPlayers.length < 11) {
//         console.log("⚠️ Failed to build team", i);
//         continue;
//       }

//       // 👑 Captain / VC
//       let captainId, viceCaptainId;

//       if (mode === "CVC") {
//         captainId = captainPool[i % captainPool.length];
//         viceCaptainId = viceCaptainPool[i % viceCaptainPool.length];
//       } else {
//         captainId =
//           teamPlayers[Math.floor(Math.random() * teamPlayers.length)].id;

//         do {
//           viceCaptainId =
//             teamPlayers[Math.floor(Math.random() * teamPlayers.length)].id;
//         } while (viceCaptainId === captainId);
//       }

//       teams.push({
//         players: teamPlayers.map(p => p.id),
//         captainId,
//         viceCaptainId
//       });
//     }

//     console.log("🎯 Generated teams:", teams.length);

//     return teams;

//   } catch (err) {
//     console.error("❌ UCT Error:", err.message);
//     throw err; 
//   }
// };  
      



import db from "../../config/db.js";  

export function teamToBinary(teamPlayers, allPlayerIds) {
  return allPlayerIds
    .map(id => (teamPlayers.includes(id) ? 1 : 0))
    .join("");
}

// export const generateUCTTeamsService = async (userId, data) => {

//   const { matchId } = data;

//   // 🧠 1) Get match teams
//   const [[match]] = await db.query(
//     `SELECT home_team_id, away_team_id
//      FROM matches
//      WHERE id = ?`,
//     [matchId]
//   );

//   if (!match) throw new Error("Match not found");

//   // 🧠 2) Check existing teams for this user + match
//   const [[countRow]] = await db.query(
//     `SELECT COUNT(*) AS count
//      FROM user_teams
//      WHERE user_id = ? AND match_id = ?`,
//     [userId, matchId]
//   );

//   const existingTeams = countRow.count;

//   if (existingTeams >= 20) {
//     throw new Error("Already 20 UCT teams generated for this match");
//   }

//   const teamsToCreate = 20 - existingTeams;

//   // 🧠 3) Get players of both teams
//   const [players] = await db.query(
//     `SELECT id, position AS role, team_id
//      FROM players
//      WHERE team_id IN (?, ?)`,
//     [match.home_team_id, match.away_team_id]
//   );

//   if (!players.length) throw new Error("No players found");

//   const allPlayerIds = players.map(p => p.id).sort((a, b) => a - b);

//   const savedTeams = [];
//   const uniqueTeams = new Set();

//   // ⭐ 4) Generate only remaining teams
//   for (let i = 0; i < teamsToCreate; i++) {

//     let validTeam = false;
//     let attempts = 0;

//     while (!validTeam && attempts < 500) {
//       attempts++;

//       const teamPlayers = [];
//       const roleCount = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
//       const teamCount = {};

//       // 🔥 Build team of 11 players
//       while (teamPlayers.length < 11) {

//         const random =
//           players[Math.floor(Math.random() * players.length)];

//         if (teamPlayers.includes(random.id)) continue;

//         // Role limits (Football)
//         if (random.role === "GK" && roleCount.GK >= 1) continue;
//         if (random.role === "DEF" && roleCount.DEF >= 6) continue;
//         if (random.role === "MID" && roleCount.MID >= 5) continue;
//         if (random.role === "FWD" && roleCount.FWD >= 3) continue;

//         // Max 8 from same real team
//         if ((teamCount[random.team_id] || 0) >= 8) continue;

//         teamPlayers.push(random.id);
//         roleCount[random.role]++;
//         teamCount[random.team_id] =
//           (teamCount[random.team_id] || 0) + 1;
//       }

//       // 🧠 Duplicate prevention (binary)
//       const binary = teamToBinary(teamPlayers, allPlayerIds);

//       if (uniqueTeams.has(binary)) continue;
//       uniqueTeams.add(binary);

//       // 👑 Captain & Vice Captain
//       const captain =
//         teamPlayers[Math.floor(Math.random() * teamPlayers.length)];

//       let viceCaptain;
//       do {
//         viceCaptain =
//           teamPlayers[Math.floor(Math.random() * teamPlayers.length)];
//       } while (viceCaptain === captain);

//       // ================================
//       // 💾 SAVE TEAM
//       // ================================

//       const [teamResult] = await db.query(
//         `INSERT INTO user_teams
//          (user_id, match_id, team_name, locked)
//          VALUES (?, ?, ?, ?)`,
//         [
//           userId,
//           matchId,
//           `UCT Team ${existingTeams + i + 1}`, // ⭐ correct numbering
//           0
//         ]
//       );

//       const teamId = teamResult.insertId;

//       // Save players
//       for (const playerId of teamPlayers) {

//         const isCaptain = playerId === captain ? 1 : 0;
//         const isViceCaptain = playerId === viceCaptain ? 1 : 0;

//         await db.query(
//           `INSERT INTO user_team_players
//            (user_team_id, player_id, is_captain, is_vice_captain)
//            VALUES (?, ?, ?, ?)`,
//           [teamId, playerId, isCaptain, isViceCaptain]
//         );
//       }

//       savedTeams.push(teamId);
//       validTeam = true;
//     }
//   }

//   console.log("🎯 Saved teams:", savedTeams.length);

//   return {
//     matchId,
//     teamIds: savedTeams,
//     totalTeams: existingTeams + savedTeams.length
//   };
// };


export const generateUCTTeamsService = async (userId, data) => {

  const { matchId } = data;

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // ============================================
    // 🔒 0) CHECK SUBSCRIPTION
    // ============================================

    const [[user]] = await conn.query(
      `SELECT subscribe
       FROM users
       WHERE id = ?`,
      [userId]
    );

    if (!user) throw new Error("User not found");

    if (user.subscribe !== 1) {
      throw new Error("UCT generation requires active subscription");
    }

    // ============================================
    // 🧠 1) Get match teams
    // ============================================

    const [[match]] = await conn.query(
      `SELECT home_team_id, away_team_id
       FROM matches
       WHERE id = ?`,
      [matchId]
    );

    if (!match) throw new Error("Match not found");

    // ============================================
    // 🧹 2) DELETE OLD UCT TEAMS
    // ============================================

    const [existingTeams] = await conn.query(
      `SELECT id FROM user_teams
       WHERE user_id = ? AND match_id = ?`,
      [userId, matchId]
    );

    if (existingTeams.length > 0) {

      const teamIds = existingTeams.map(t => t.id);

      await conn.query(
        `DELETE FROM user_team_players
         WHERE user_team_id IN (?)`,
        [teamIds]
      );

      await conn.query(
        `DELETE FROM user_teams
         WHERE id IN (?)`,
        [teamIds]
      );
    }

    // ============================================
    // 🧠 3) Get players
    // ============================================

    const [players] = await conn.query(
      `SELECT id, position AS role, team_id
       FROM players
       WHERE team_id IN (?, ?)`,
      [match.home_team_id, match.away_team_id]
    );

    if (!players.length) throw new Error("No players found");

    const allPlayerIds = players.map(p => p.id).sort((a, b) => a - b);

    const savedTeams = [];
    const uniqueTeams = new Set();

    // ============================================
    // ⭐ 4) GENERATE 20 TEAMS
    // ============================================

    for (let i = 0; i < 20; i++) {

      let validTeam = false;
      let attempts = 0;

      while (!validTeam && attempts < 500) {
        attempts++;

        const teamPlayers = [];
        const roleCount = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
        const teamCount = {};

        while (teamPlayers.length < 11) {

          const random =
            players[Math.floor(Math.random() * players.length)];

          if (teamPlayers.includes(random.id)) continue;

          if (random.role === "GK" && roleCount.GK >= 1) continue;
          if (random.role === "DEF" && roleCount.DEF >= 6) continue;
          if (random.role === "MID" && roleCount.MID >= 5) continue;
          if (random.role === "FWD" && roleCount.FWD >= 3) continue;

          if ((teamCount[random.team_id] || 0) >= 8) continue;

          teamPlayers.push(random.id);
          roleCount[random.role]++;
          teamCount[random.team_id] =
            (teamCount[random.team_id] || 0) + 1;
        }

        const binary = teamToBinary(teamPlayers, allPlayerIds);

        if (uniqueTeams.has(binary)) continue;
        uniqueTeams.add(binary);

        const captain =
          teamPlayers[Math.floor(Math.random() * teamPlayers.length)];

        let viceCaptain;
        do {
          viceCaptain =
            teamPlayers[Math.floor(Math.random() * teamPlayers.length)];
        } while (viceCaptain === captain);

        const [teamResult] = await conn.query(
          `INSERT INTO user_teams
           (user_id, match_id, team_name, locked)
           VALUES (?, ?, ?, ?)`,
          [
            userId,
            matchId,
            `UCT Team ${i + 1}`,
            0
          ]
        );

        const teamId = teamResult.insertId;

        for (const playerId of teamPlayers) {

          const isCaptain = playerId === captain ? 1 : 0;
          const isViceCaptain = playerId === viceCaptain ? 1 : 0;

          await conn.query(
            `INSERT INTO user_team_players
             (user_team_id, player_id, is_captain, is_vice_captain)
             VALUES (?, ?, ?, ?)`,
            [teamId, playerId, isCaptain, isViceCaptain]
          );
        }

        savedTeams.push(teamId);
        validTeam = true;
      }
    }

    await conn.commit();
  
    return {
      matchId,
      teamIds: savedTeams,
      totalTeams: savedTeams.length
    };

  } catch (err) {
    await conn.rollback();
    throw err;

  } finally {
    conn.release();
  }
};

export const getUserUCTTeamsService = async (userId, matchId) => {

  const [teams] = await db.query(
    `SELECT id, team_name, locked, created_at
     FROM user_teams
     WHERE user_id = ? AND match_id = ?
     ORDER BY id DESC`,
    [userId, matchId]
  );

  if (!teams.length) return [];

  const result = [];

  for (const team of teams) {

    const [players] = await db.query(
      `SELECT 
          utp.player_id,
          utp.is_captain,
          utp.is_vice_captain,
          p.name,
          p.position,
          p.team_id
       FROM user_team_players utp
       JOIN players p ON p.id = utp.player_id
       WHERE utp.user_team_id = ?`,
      [team.id]
    );

    result.push({
      teamId: team.id,
      teamName: team.team_name,
      locked: team.locked,
      players
    });
  }

  return result;
};  