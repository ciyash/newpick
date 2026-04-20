import { spawn } from "child_process";
import { chmodSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BINARY_NAME = process.platform === "win32" ? "UCT.exe" : "UCT.5";
const BINARY_PATH = path.join(__dirname, "../../dist", BINARY_NAME);

// Ensure binary executable
if (process.platform !== "win32") {
  try { chmodSync(BINARY_PATH, 0o755); }
  catch (e) { console.warn("chmod failed:", e.message); }
}

//  RUN BINARY
function runBinary(teamA, teamB) {
  return new Promise((resolve, reject) => {

    const players = [
      ...teamA.map(p => ({ ...p, Team: "A" })),
      ...teamB.map(p => ({ ...p, Team: "B" }))
    ];

    const child = spawn(BINARY_PATH, [], {
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true
    });

    let output = "";

    child.stdout.on("data", chunk => {
      output += chunk.toString();
    });

    child.on("error", err => {
      reject(new Error("Binary failed: " + err.message));
    });

    child.on("close", code => {
      if (code !== 0) {
        return reject(new Error(`Binary exit code ${code}`));
      }

      try {
        resolve(JSON.parse(output.trim()));
      } catch {
        reject(new Error("Invalid JSON from binary"));
      }
    });

    child.stdin.write(JSON.stringify(players));
    child.stdin.end();
  });
}


// GROUP BY TEAM
function groupByTeam(players) {
  const map = {};
  for (const p of players) {
    const key = p.DT_no ?? p.Team_no ?? p.TeamId;
    if (!key) throw new Error("Missing team key");

    if (!map[key]) map[key] = [];
    map[key].push(p);
  }
  return map;
}

 // MAIN SERVICE

export const generateTeamsService = async (userId, { matchId, teamA, teamB }) => {
  const conn = await db.getConnection();

  try {
   
    // 1. VALIDATIONS (PARALLEL)
    const allPlayerIds = [...teamA, ...teamB].map(p => Number(p.Player));
    if (!allPlayerIds.length) throw new Error("No players provided");

    const [[matchRows], [logRows], [validPlayers]] = await Promise.all([
      conn.query(
        `SELECT status, start_time FROM matches WHERE id = ? LIMIT 1`,
        [matchId]
      ),
      conn.query(
        `SELECT id FROM match_generation_log WHERE match_id = ? AND user_id = ? LIMIT 1`,
        [matchId, userId]
      ),
      conn.query(
        `SELECT id FROM players WHERE id IN (?)`,
        [allPlayerIds]
      ),
    ]);

    const match = matchRows[0];

    if (!match) throw new Error("Match not found");

    if (
      match.status?.toLowerCase() !== "upcoming" ||
      new Date() >= new Date(match.start_time)
    ) throw new Error("Team generation closed");

    if (logRows[0]) throw new Error("Already generated");

    if (validPlayers.length !== allPlayerIds.length) {
      throw new Error("Invalid players");
    }

    // 2. RUN BINARY + FETCH EXISTING TEAMS
    const [rawOutput, [existingTeams]] = await Promise.all([
      runBinary(teamA, teamB),
      conn.query(
        `SELECT id FROM user_teams WHERE user_id = ? AND match_id = ?`,
        [userId, matchId]
      )
    ]);

    // 3. PROCESS OUTPUT
    const grouped = groupByTeam(rawOutput);
    const teams = Object.entries(grouped).slice(0, 20);

    if (!teams.length) throw new Error("No teams generated");
    // 4. PREPARE TEAM DATA
    const teamMeta = teams.map(([, members]) => {

      const captain = members.find(p => p.Cap === "C");
      const vice = members.find(p => p.Cap === "VC");

      const captainId = captain?.Player ? Number(captain.Player) : null;
      const viceCaptainId = vice?.Player ? Number(vice.Player) : null;

      const playerIds = members.map(p => Number(p.Player));

      const signature =
        playerIds.sort((a, b) => a - b).join(",") +
        `|C${captainId}|VC${viceCaptainId}`;

      return { members, captainId, viceCaptainId, signature };
    });

    // 5. TRANSACTION (WRITE ONLY)
    await conn.beginTransaction();

    // Delete old teams
    if (existingTeams.length) {
      const ids = existingTeams.map(t => t.id);

      await Promise.all([
        conn.query(`DELETE FROM user_team_players WHERE user_team_id IN (?)`, [ids]),
        conn.query(`DELETE FROM user_teams WHERE id IN (?)`, [ids])
      ]);
    }

    // Insert teams
    const [result] = await conn.query(
      `INSERT INTO user_teams (user_id, match_id, team_name, team_signature, locked)
       VALUES ?`,
      [teamMeta.map((t, i) => [
        userId,
        matchId,
        `Team ${i + 1}`,
        t.signature,
        0
      ])]
    );

    const startId = result.insertId;

    // 6. BULK PLAYER INSERT
    const playerRows = [];

    teamMeta.forEach(({ members, captainId, viceCaptainId }, i) => {
      const teamId = startId + i;

      members.forEach(p => {
        const pid = Number(p.Player);

        playerRows.push([
          teamId,
          pid,
          p.Role,
          pid === captainId ? 1 : 0,
          pid === viceCaptainId ? 1 : 0
        ]);
      });
    });

    await Promise.all([
      conn.query(
        `INSERT INTO user_team_players
         (user_team_id, player_id, role, is_captain, is_vice_captain)
         VALUES ?`,
        [playerRows]
      ),
      conn.query(
        `INSERT INTO match_generation_log (match_id, user_id, total_teams)
         VALUES (?, ?, ?)`,
        [matchId, userId, teamMeta.length]
      )
    ]);

    await conn.commit();

    // 7. BACKGROUND UPDATE (NON-BLOCKING)
    updatePlayerPercentages(allPlayerIds, matchId).catch(console.error);

    return {
      success: true,
      message: "Teams generated successfully",
      totalTeams: teamMeta.length
    };

  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};

//  PERCENTAGE UPDATE (ASYNC)
async function updatePlayerPercentages(allPlayerIds, matchId) {
  const conn = await db.getConnection();

  try {
    const [[{ totalTeams }]] = await conn.query(
      `SELECT COUNT(*) totalTeams FROM user_teams WHERE match_id = ?`,
      [matchId]
    );

    if (!totalTeams) return;

    await conn.query(
      `UPDATE players p
       JOIN (
         SELECT
           utp.player_id,
           ROUND(COUNT(*) / ? * 100, 2) AS sel_pct,
           ROUND(SUM(utp.is_captain) / ? * 100, 2) AS cap_pct,
           ROUND(SUM(utp.is_vice_captain) / ? * 100, 2) AS vc_pct
         FROM user_team_players utp
         JOIN user_teams ut ON ut.id = utp.user_team_id
         WHERE ut.match_id = ? AND utp.player_id IN (?)
         GROUP BY utp.player_id
       ) agg ON agg.player_id = p.id
       SET
         p.selectpercent = agg.sel_pct,
         p.captainper = agg.cap_pct,
         p.vcper = agg.vc_pct`,
      [totalTeams, totalTeams, totalTeams, matchId, allPlayerIds]
    );

  } finally {
    conn.release();
  }
}