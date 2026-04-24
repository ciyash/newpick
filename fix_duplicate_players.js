import db from "./src/config/db.js";

const fixDuplicatePlayers = async () => {
  console.log("🔧 Starting duplicate player fix...");

  const [duplicates] = await db.query(`
    SELECT provider_player_id, MIN(id) as keep_id, GROUP_CONCAT(id ORDER BY id ASC) as all_ids
    FROM players
    GROUP BY provider_player_id
    HAVING COUNT(*) > 1
  `);

  console.log(`Found ${duplicates.length} duplicate provider_player_ids`);

  const allOldIds = [];
  const updateMap = {}; // oldId → keepId

  for (const dup of duplicates) {
    const keepId = dup.keep_id;
    const allIds = dup.all_ids.split(",").map(Number);
    const oldIds = allIds.filter(id => id !== keepId);
    oldIds.forEach(id => {
      allOldIds.push(id);
      updateMap[id] = keepId;
    });
  }

  console.log(`Total old ids to fix: ${allOldIds.length}`);

  // Bulk update — CASE WHEN approach
  const cases = Object.entries(updateMap)
    .map(([oldId, newId]) => `WHEN ${oldId} THEN ${newId}`)
    .join("\n");

  const idList = allOldIds.join(",");

  // user_team_players
  const [r1] = await db.query(
    `UPDATE user_team_players 
     SET player_id = CASE player_id ${cases} END
     WHERE player_id IN (${idList})`
  );
  console.log(`✅ user_team_players updated: ${r1.affectedRows}`);

  // match_players
  const [r2] = await db.query(
    `UPDATE match_players 
     SET player_id = CASE player_id ${cases} END
     WHERE player_id IN (${idList})`
  );
  console.log(`✅ match_players updated: ${r2.affectedRows}`);

  // player_match_stats
  const [r3] = await db.query(
    `UPDATE player_match_stats 
     SET player_id = CASE player_id ${cases} END
     WHERE player_id IN (${idList})`
  );
  console.log(`✅ player_match_stats updated: ${r3.affectedRows}`);

  // Delete duplicates
  const [r4] = await db.query(
    `DELETE FROM players WHERE id IN (${idList})`
  );
  console.log(`✅ duplicate players deleted: ${r4.affectedRows}`);

  console.log("✅ Done!");
  process.exit(0);
};

fixDuplicatePlayers().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});