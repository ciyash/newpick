import { spawn } from "child_process";
import { chmodSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BINARY_NAME = process.platform === "win32" ? "UCT.exe" : "UCT.5";
const BINARY_PATH = path.join(__dirname, "../../dist", BINARY_NAME);

if (process.platform !== "win32") {
  try {
    chmodSync(BINARY_PATH, 0o755);
  } catch (e) {
    console.warn("Could not chmod binary:", e.message);
  }
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

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", d => stdout += d.toString());
    child.stderr.on("data", d => stderr += d.toString());

    child.on("error", err => reject(
      new Error(`Binary failed to start: ${err.message}`)
    ));

    child.on("close", code => {

      if (code !== 0) {
        return reject(
          new Error(`Binary exited with code ${code}: ${stderr}`)
        );
      }

      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error("Binary output is not valid JSON"));
      }

    });

    child.stdin.write(JSON.stringify(players));
    child.stdin.end();

  });

}


/* GROUP BY TEAM */

function groupByTeam(players) {

  const teams = {};

  for (const p of players) {
    if (!teams[p.DT_no]) teams[p.DT_no] = [];
    teams[p.DT_no].push(p);
  }

  return teams;

}


/* MAIN SERVICE */

export const generateTeamsService = async (userId, matchId, teamA, teamB) => {

  const conn = await db.getConnection();

  try {

    await conn.beginTransaction();


    /* MATCH CHECK */

    const [[match]] = await conn.query(
      `SELECT status,start_time FROM matches WHERE id=?`,
      [matchId]
    );

    if (!match) throw new Error("Match not found");

    if (
      match.status?.trim().toLowerCase() !== "upcoming" ||
      new Date() >= new Date(match.start_time)
    ) {
      throw new Error("Team generation is closed for this match");
    }


    /* EXISTING TEAMS */

    const [existingTeams] = await conn.query(
      `SELECT id FROM user_teams
       WHERE user_id=? AND match_id=?
       ORDER BY id`,
      [userId, matchId]
    );


    /* RUN BINARY */

    const rawOutput = await runBinary(teamA, teamB);

    const grouped = groupByTeam(rawOutput);

    const teamsToSave = Object.entries(grouped).slice(0, 20);

    if (!teamsToSave.length) {
      throw new Error("Binary generated no teams");
    }


    const savedTeams = [];

    for (let i = 0; i < teamsToSave.length; i++) {

      const [, members] = teamsToSave[i];

      const captain = members.find(p => p.Cap === "C");
      const vice = members.find(p => p.Cap === "VC");

      const captainId = captain?.Player ? Number(captain.Player) : null;
      const viceCaptainId = vice?.Player ? Number(vice.Player) : null;

      const playerIds = members.map(p => Number(p.Player));

      const signature =
        [...playerIds].sort((a,b)=>a-b).join(",") +
        `|C${captainId}|VC${viceCaptainId}`;

      let teamId;


      /* UPDATE EXISTING TEAM */

      if (i < existingTeams.length) {

        teamId = existingTeams[i].id;

        await conn.query(
          `UPDATE user_teams
           SET team_signature=?, locked=0
           WHERE id=?`,
          [signature, teamId]
        );

        await conn.query(
          `DELETE FROM user_team_players
           WHERE user_team_id=?`,
          [teamId]
        );

      }

      /* INSERT NEW TEAM */

      else {

        const teamName = `Team ${i+1}`;

        const [result] = await conn.execute(
          `INSERT INTO user_teams
          (user_id,match_id,team_name,team_signature,locked)
          VALUES (?,?,?,?,0)`,
          [userId, matchId, teamName, signature]
        );

        teamId = result.insertId;

      }


      /* INSERT PLAYERS */

      const rows = members.map(p => [

        teamId,
        Number(p.Player),
        p.Role,
        Number(p.Player) === captainId ? 1 : 0,
        Number(p.Player) === viceCaptainId ? 1 : 0

      ]);

      await conn.query(
        `INSERT INTO user_team_players
        (user_team_id,player_id,role,is_captain,is_vice_captain)
        VALUES ?`,
        [rows]
      );


      savedTeams.push({ teamId });

    }


    /* UPDATE PLAYER PERCENTAGES */

    const [[{ totalTeams }]] = await conn.query(
      `SELECT COUNT(*) totalTeams
       FROM user_teams
       WHERE match_id=?`,
      [matchId]
    );

    const playerIds = [...teamA,...teamB].map(p=>Number(p.Player));

    if (totalTeams && playerIds.length) {

      await conn.query(

        `UPDATE players p SET

        selectpercent = ROUND((
          SELECT COUNT(*)
          FROM user_team_players utp
          JOIN user_teams ut ON ut.id=utp.user_team_id
          WHERE utp.player_id=p.id AND ut.match_id=?
        )/?*100,2),

        captainper = ROUND((
          SELECT COUNT(*)
          FROM user_team_players utp
          JOIN user_teams ut ON ut.id=utp.user_team_id
          WHERE utp.player_id=p.id
          AND ut.match_id=?
          AND utp.is_captain=1
        )/?*100,2),

        vcper = ROUND((
          SELECT COUNT(*)
          FROM user_team_players utp
          JOIN user_teams ut ON ut.id=utp.user_team_id
          WHERE utp.player_id=p.id
          AND ut.match_id=?
          AND utp.is_vice_captain=1
        )/?*100,2)

        WHERE p.id IN (?)`,

        [matchId,totalTeams,matchId,totalTeams,matchId,totalTeams,playerIds]

      );

    }


    await conn.commit();


    return {

      success:true,
      message:"Teams regenerated successfully",
      totalSaved:savedTeams.length

    };

  }

  catch(err){

    await conn.rollback();
    throw err;

  }

  finally{

    conn.release();

  }

};