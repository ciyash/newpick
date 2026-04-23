import  db  from "../../config/db.js";

import {   getMatchesService } from "./match.service.js";


export const getAllMatches = async (req, res) => {


  try {
    const [rows] = await db.execute(`
      SELECT 
        m.id,
        m.series_id,
        m.start_time,
        m.status,
        m.created_at,

        ht.id AS home_team_id,
        ht.name AS home_team_name,

        at.id AS away_team_id,
        at.name AS away_team_name

      FROM matches m

      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id

      WHERE m.status = 'UPCOMING'
      ORDER BY m.start_time ASC
    `);

    return res.status(200).json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (error) {

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

export const getMatches = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

  const status = req.params.status

 const validTypes = ["LIVE", "UPCOMING", "INREVIEW", "COMPLETED"];
  
    if (!status || !validTypes.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status query param required. Valid values: ${validTypes.join(", ")}`,
      });
    }

    const data = await getMatchesService(userId, status);

    return res.status(200).json({
      success: true,
      status,
      count: data.length,
      data,
    });

  } catch (error) {
    console.error("getMatches error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch matches",
      error: error.message,
    });
  }
};

export const getMatchFullDetails = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Match details (support BOTH db id and provider_match_id)
    const [[match]] = await db.execute(
      `SELECT 
         id,
         provider_match_id,
         series_id, seriesname,
         home_team_id, hometeamname,
         away_team_id, awayteamname,
         matchdate, start_time, status, is_active,
         lineupavailable,
         lineup_status
       FROM matches
       WHERE id = ? OR provider_match_id = ?`,
      [id, id]
    );

    if (!match) {
      return res.status(404).json({
        success: false,
        message: "Match not found",
      });
    }

    // 2️⃣ Teams
    const [teams] = await db.execute(
      `SELECT 
          id, name, short_name, logo, provider_team_id
       FROM teams
       WHERE id IN (?, ?)`,
      [match.home_team_id, match.away_team_id]
    );

    const homeTeam =
      teams.find((t) => Number(t.id) === Number(match.home_team_id)) || null;

    const awayTeam =
      teams.find((t) => Number(t.id) === Number(match.away_team_id)) || null;

    // 3️⃣ Check match_players count
    const [[mpCheck]] = await db.execute(
      `SELECT COUNT(*) AS count
       FROM match_players
       WHERE match_id = ?`,
      [match.id] 
    );

    let players = [];

    // normalize lineup_status
    const lineupStatus = String(match.lineup_status || "")
      .trim()
      .toLowerCase();

    // 4️⃣ Main fetch logic
    if (Number(mpCheck.count) > 0) {
      const [mpPlayers] = await db.execute(
        `SELECT 
            p.id,
            p.name,
            p.position,
            p.player_type,
            p.country,
            p.playercredits,
            p.playerimage,
            p.flag_image,
            p.selectpercent,
            p.captainper,
            p.vcper,
            p.provider_player_id,
            p.team_id,
            p.points,
            p.created_at,

            COALESCE(mp.is_playing, 0) AS is_playing,
            COALESCE(mp.is_substitute, 0) AS is_substitute,
            COALESCE(mp.is_pre_squad, 0) AS is_pre_squad

         FROM match_players mp
         JOIN players p ON p.id = mp.player_id
         WHERE mp.match_id = ?`,
        [match.id] 
      );

      players = mpPlayers;
    }

    // fallback players
    if (players.length === 0) {
      const [allPlayers] = await db.execute(
        `SELECT 
            id,
            team_id,
            name,
            position,
            player_type,
            country,
            playercredits,
            playerimage,
            flag_image,
            selectpercent,
            captainper,
            vcper,
            provider_player_id,
            points,
            created_at
         FROM players
         WHERE team_id IN (?, ?)`,
        [match.home_team_id, match.away_team_id]
      );

      players = allPlayers.map((p) => ({
        ...p,
        is_playing: 0,
        is_substitute: 0,
        is_pre_squad: 1,
      }));
    }

    // 5️⃣ Split players by team
    const homePlayers = players.filter(
      (p) => Number(p.team_id) === Number(match.home_team_id)
    );

    const awayPlayers = players.filter(
      (p) => Number(p.team_id) === Number(match.away_team_id)
    );

    // 6️⃣ Playing XI
    const homePlayingXI = homePlayers.filter(
      (p) => Number(p.is_playing) === 1
    );

    const awayPlayingXI = awayPlayers.filter(
      (p) => Number(p.is_playing) === 1
    );

    // 7️⃣ Substitutes
    const homeSubs = homePlayers.filter(
      (p) => Number(p.is_substitute) === 1
    );

    const awaySubs = awayPlayers.filter(
      (p) => Number(p.is_substitute) === 1
    );

    // 8️⃣ Squad
    let homeSquad = homePlayers.filter(
      (p) => Number(p.is_pre_squad) === 1
    );

    let awaySquad = awayPlayers.filter(
      (p) => Number(p.is_pre_squad) === 1
    );

    if (homeSquad.length === 0) {
      homeSquad = homePlayers;
    }

    if (awaySquad.length === 0) {
      awaySquad = awayPlayers;
    }

    // 9️⃣ Final lineup status derive
    let finalLineupStatus = match.lineup_status || "not_available";

    if (homePlayingXI.length > 0 || awayPlayingXI.length > 0) {
      finalLineupStatus = "confirmed";
    } else if (players.length > 0) {
      finalLineupStatus = lineupStatus || "announced";
    }

    return res.status(200).json({
      success: true,
      data: {
        match,
        lineup_status: finalLineupStatus,

        home_team: {
          ...homeTeam,
          playing_xi: homePlayingXI,
          substitutes: homeSubs,
          squad: homeSquad,
        },

        away_team: {
          ...awayTeam,
          playing_xi: awayPlayingXI,
          substitutes: awaySubs,
          squad: awaySquad,
        },

        counts: {
          total_players: players.length,
          home_players: homePlayers.length,
          away_players: awayPlayers.length,
          home_playing_xi: homePlayingXI.length,
          away_playing_xi: awayPlayingXI.length,
          home_substitutes: homeSubs.length,
          away_substitutes: awaySubs.length,
          home_squad: homeSquad.length,
          away_squad: awaySquad.length,
        },
      },
    });
  } catch (error) {
    console.error("getMatchFullDetails Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
