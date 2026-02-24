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


export const generateUCTTeamsService = async (userId, data) => {
  const { matchId } = data;

  // 🧠 Get match teams
  const [[match]] = await db.query(
    `SELECT home_team_id, away_team_id
     FROM matches
     WHERE id = ?`,
    [matchId]
  );

  if (!match) throw new Error("Match not found");

  // 🧠 Get players of both teams
  const [players] = await db.query(
    `SELECT id, position AS role, team_id
     FROM players
     WHERE team_id IN (?, ?)`,
    [match.home_team_id, match.away_team_id]
  );

  if (!players.length) throw new Error("No players found");

  console.log("👥 Player pool:", players.length);

  const allPlayerIds = players.map(p => p.id).sort((a,b)=>a-b);

  const teams = [];
  const uniqueTeams = new Set(); // 🔥 Duplicate prevention

  // ⭐ Generate 20 unique teams
  for (let i = 0; i < 20; i++) {

    let validTeam = false;
    let attempts = 0;

    while (!validTeam && attempts < 500) {
      attempts++;

      const teamPlayers = [];
      const roleCount = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
      const teamCount = {};

      // 🔥 Build team of 11 players
      while (teamPlayers.length < 11) {

        const random =
          players[Math.floor(Math.random() * players.length)];

        if (teamPlayers.includes(random.id)) continue;

        // Role limits (football)
        if (random.role === "GK" && roleCount.GK >= 1) continue;
        if (random.role === "DEF" && roleCount.DEF >= 6) continue;
        if (random.role === "MID" && roleCount.MID >= 5) continue;
        if (random.role === "FWD" && roleCount.FWD >= 3) continue;

        // Max 8 from same team
        if ((teamCount[random.team_id] || 0) >= 8) continue;

        teamPlayers.push(random.id);
        roleCount[random.role]++;
        teamCount[random.team_id] =
          (teamCount[random.team_id] || 0) + 1;
      }

      // 🧠 Convert to binary
      const binary = teamToBinary(teamPlayers, allPlayerIds);

      // ❌ Duplicate check
      if (uniqueTeams.has(binary)) {
        continue;
      }

      uniqueTeams.add(binary);

      // 👑 Random Captain & VC
      const captain =
        teamPlayers[Math.floor(Math.random() * teamPlayers.length)];

      let viceCaptain;
      do {
        viceCaptain =
          teamPlayers[Math.floor(Math.random() * teamPlayers.length)];
      } while (viceCaptain === captain);

      teams.push({
        players: teamPlayers,
        binary,
        captainId: captain,
        viceCaptainId: viceCaptain
      });

      validTeam = true;
    }

    if (!validTeam) {
      console.log("⚠️ Failed to generate unique team", i);
    }
  }

  console.log("🎯 Generated unique teams:", teams.length);

  return teams;
};