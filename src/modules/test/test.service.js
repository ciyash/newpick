import db from "../../config/db.js";

export const manualPlayingXIService = async (matchId, players) => {
  // 1. Match exists check
  const [[matchRow]] = await db.query(
    `SELECT id FROM matches WHERE provider_match_id = ? LIMIT 1`,
    [matchId]
  );
  if (!matchRow) throw new Error("Match not found: " + matchId);

  // 2. provider_player_ids collect
  const pids = players.map((p) => String(p.provider_player_id));

  // 3. players table lo fetch
  const [playerRows] = await db.query(
    `SELECT id, provider_player_id, team_id 
     FROM players WHERE provider_player_id IN (?)`,
    [pids]
  );
  const playerMap = new Map(
    playerRows.map((r) => [r.provider_player_id, r])
  );

  // 4. Clean slate — existing match_players delete
  await db.query(`DELETE FROM match_players WHERE match_id = ?`, [matchRow.id]);

  let count = 0;
  const notFound = [];

  for (const p of players) {
    const pid = String(p.provider_player_id);
    const playerRow = playerMap.get(pid);

    if (!playerRow) {
      notFound.push(pid);
      continue;
    }

    await db.query(
      `INSERT INTO match_players
         (match_id, player_id, team_id, is_playing, is_substitute, is_pre_squad)
       VALUES (?, ?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE
         is_playing    = VALUES(is_playing),
         is_substitute = VALUES(is_substitute),
         is_pre_squad  = 0`,
      [
        matchRow.id,
        playerRow.id,
        playerRow.team_id,
        p.is_substitute === 0 ? 1 : 0,
        p.is_substitute ? 1 : 0,
      ]
    );
    count++;
  }

  // 5. Match lineup status update
  await db.query(
    `UPDATE matches 
     SET lineupavailable = 1, lineup_status = 'confirmed' 
     WHERE id = ?`,
    [matchRow.id]
  );

  return {
    success: true,
    inserted: count,
    not_found_pids: notFound, // DB లో లేని players
  };
};


export const manualPlayerPointsService = async (matchId, players) => {
  const [[matchRow]] = await db.query(
    `SELECT id, status FROM matches WHERE provider_match_id = ? LIMIT 1`,
    [matchId]
  );
  if (!matchRow) throw new Error("Match not found: " + matchId);

  const POINTS = { goal: 6, assist: 3, yellow_card: -1, red_card: -3 };
  let count = 0;

  for (const p of players) {
    const pid = String(p.provider_player_id);

    const [[playerRow]] = await db.query(
      `SELECT id FROM players WHERE provider_player_id = ? LIMIT 1`,
      [pid]
    );
    if (!playerRow) continue;

    const fantasy_points =
      ((p.goals        || 0) * POINTS.goal)       +
      ((p.assists      || 0) * POINTS.assist)      +
      ((p.yellow_cards || 0) * POINTS.yellow_card) +
      ((p.red_cards    || 0) * POINTS.red_card);

    await db.query(
      `INSERT INTO player_match_stats
         (match_id, player_id, goals, assists, yellow_cards, red_cards, fantasy_points)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         goals          = VALUES(goals),
         assists        = VALUES(assists),
         yellow_cards   = VALUES(yellow_cards),
         red_cards      = VALUES(red_cards),
         fantasy_points = VALUES(fantasy_points)`,
      [matchRow.id, playerRow.id,
       p.goals || 0, p.assists || 0,
       p.yellow_cards || 0, p.red_cards || 0,
       fantasy_points]
    );

    await db.query(
      `UPDATE players
       SET points = (
         SELECT COALESCE(SUM(fantasy_points), 0)
         FROM player_match_stats WHERE player_id = ?
       )
       WHERE id = ?`,
      [playerRow.id, playerRow.id]
    );

    count++;
  }

  return { success: true, updated: count };
};