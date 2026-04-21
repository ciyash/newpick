import { spawn } from "child_process";
import { chmodSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../../config/db.js";
import { logActivity } from "../../utils/activity.logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BINARY_NAME = process.platform === "win32" ? "UCT.exe" : "UCT.5";
const BINARY_PATH = path.join(__dirname, "../../dist", BINARY_NAME);

if (process.platform !== "win32") {
  try { chmodSync(BINARY_PATH, 0o755); }
  catch (e) { console.warn("Could not chmod binary:", e.message); }
}


/* RUN BINARY */

function runBinary(teamA, teamB) {
  return new Promise((resolve, reject) => {
    const players = [
      ...teamA.map(p => ({ ...p, Team: "A" })),
      ...teamB.map(p => ({ ...p, Team: "B" }))
    ];

    const child = spawn(BINARY_PATH, [], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    const chunks = [];
    child.stdout.on("data", d => chunks.push(d));
    child.stderr.on("data", () => {});

    child.on("error", err => reject(new Error(`Binary failed to start: ${err.message}`)));
    child.on("close", code => {
      if (code !== 0) return reject(new Error(`Binary exited with code ${code}`));
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8").trim()));
      } catch {
        reject(new Error("Binary output is not valid JSON"));
      }
    });

    child.stdin.write(JSON.stringify(players), "utf8", () => child.stdin.end());
  });
}


/* GROUP BY TEAM */

function groupByTeam(players) {
  const teams = {};
  for (const p of players) {
    const key = p.DT_no ?? p.Team_no ?? p.TeamId;
    if (key == null) throw new Error("Binary output missing team group key");
    (teams[key] ??= []).push(p);
  }
  return teams;
}


/* MAIN SERVICE */

export const generateTeamsService = async (userId, matchId, teamA, teamB) => {

  const conn = await db.getConnection();

  try {

    // ── 1. All preflight DB checks in parallel ──
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
        `SELECT id FROM players WHERE id IN (?) LIMIT ?`,
        [allPlayerIds, allPlayerIds.length + 1]
      ),
    ]);

    // ── 2. Validate ──
    const match = matchRows[0];
    if (!match) throw new Error("Match not found");
    if (
      match.status?.trim().toLowerCase() !== "upcoming" ||
      new Date() >= new Date(match.start_time)
    ) throw new Error("Team generation is closed for this match");

    if (logRows[0]) throw new Error("Teams already generated for this match");

    if (validPlayers.length !== allPlayerIds.length) {
      const validSet = new Set(validPlayers.map(r => r.id));
      const invalid = allPlayerIds.filter(id => !validSet.has(id));
      throw new Error(`Players do not belong to this match: ${invalid.join(", ")}`);
    }

    // ── 3. KEY CHANGE: Run binary AND fetch existing teams in parallel ──
    //    The binary is the slowest part — hide the DB fetch inside its wait time
    const [rawOutput, [existingTeams]] = await Promise.all([
      runBinary(teamA, teamB),
      conn.query(
        `SELECT id FROM user_teams WHERE user_id = ? AND match_id = ?`,
        [userId, matchId]
      ),
    ]);

    // ── 4. Process binary output ──
    const grouped = groupByTeam(rawOutput);
    const teamsToSave = Object.entries(grouped).slice(0, 20);
    if (!teamsToSave.length) throw new Error("Binary generated no teams");

    const teamMeta = teamsToSave.map(([, members]) => {
      const captain       = members.find(p => p.Cap === "C");
      const vice          = members.find(p => p.Cap === "VC");
      const captainId     = captain?.Player    ? Number(captain.Player)    : null;
      const viceCaptainId = vice?.Player       ? Number(vice.Player)       : null;
      const playerIds     = members.map(p => Number(p.Player));
      const signature     =
        [...playerIds].sort((a, b) => a - b).join(",") +
        `|C${captainId}|VC${viceCaptainId}`;
      return { members, captainId, viceCaptainId, signature };
    });

    // ── 5. Short transaction — writes only, no reads inside ──
    await conn.beginTransaction();

    // Delete old teams if any (we already fetched them above)
    if (existingTeams.length) {
      const ids = existingTeams.map(t => t.id);
      await Promise.all([
        conn.query(`DELETE FROM user_team_players WHERE user_team_id IN (?)`, [ids]),
        conn.query(`DELETE FROM user_teams WHERE id IN (?)`, [ids]),
      ]);
    }

    // Bulk insert user_teams
    const [insertResult] = await conn.query(
      `INSERT INTO user_teams (user_id, match_id, team_name, team_signature, locked) VALUES ?`,
      [teamMeta.map((m, i) => [userId, matchId, `Team ${i + 1}`, m.signature, 0])]
    );

    const firstInsertId = insertResult.insertId;

    // Build player rows
    const playerRows = [];
    teamMeta.forEach(({ members, captainId, viceCaptainId }, i) => {
      const teamId = firstInsertId + i;
      for (const p of members) {
        const pid = Number(p.Player);
        playerRows.push([
          teamId, pid, p.Role,
          pid === captainId     ? 1 : 0,
          pid === viceCaptainId ? 1 : 0,
        ]);
      }
    });

    // KEY CHANGE: Run both inserts in parallel — they touch different tables
    await Promise.all([
      conn.query(
        `INSERT INTO user_team_players
         (user_team_id, player_id, role, is_captain, is_vice_captain) VALUES ?`,
        [playerRows]
      ),
      conn.query(
        `INSERT INTO match_generation_log (match_id, user_id, total_teams) VALUES (?, ?, ?)`,
        [matchId, userId, teamMeta.length]
      ),
    ]);

    await conn.commit();

    // ── 6. Fire-and-forget percentage update ──
    updatePlayerPercentages(allPlayerIds, matchId).catch(err =>
      console.error("[updatePlayerPercentages]", err)
    );

    logActivity({
      userId,
      type:        "contest",
      sub_type:    "teams_generated",
      title:       "Teams Generated",
      description: `${teamMeta.length} teams generated for Match #${matchId}`,
      icon:        "team",
      meta:        { matchId, totalTeams: teamMeta.length },
    });

    return {
      success:    true,
      message:    "Teams generated successfully",
      totalSaved: teamMeta.length,
    };

  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
};


/* PERCENTAGE UPDATE — runs after response is sent */

async function updatePlayerPercentages(allPlayerIds, matchId) {
  const conn = await db.getConnection();
  try {
    const [[{ totalTeams }]] = await conn.query(
      `SELECT COUNT(*) totalTeams FROM user_teams WHERE match_id = ?`,
      [matchId]
    );
    if (!totalTeams || !allPlayerIds.length) return;

    await conn.query(
      `UPDATE players p
       JOIN (
         SELECT
           utp.player_id,
           ROUND(COUNT(*)                 / ? * 100, 2) AS sel_pct,
           ROUND(SUM(utp.is_captain)      / ? * 100, 2) AS cap_pct,
           ROUND(SUM(utp.is_vice_captain) / ? * 100, 2) AS vc_pct
         FROM user_team_players utp
         JOIN user_teams ut ON ut.id = utp.user_team_id
         WHERE ut.match_id = ? AND utp.player_id IN (?)
         GROUP BY utp.player_id
       ) agg ON agg.player_id = p.id
       SET
         p.selectpercent = agg.sel_pct,
         p.captainper    = agg.cap_pct,
         p.vcper         = agg.vc_pct`,
      [totalTeams, totalTeams, totalTeams, matchId, allPlayerIds]
    );
  } finally {
    conn.release();
  }
}
