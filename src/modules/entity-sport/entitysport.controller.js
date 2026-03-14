import {
  syncSeriesService,
  syncTeamsService,
  syncMatchesService,
  syncPlayersService,
  syncPlayingXIService,
  syncPlayerPointsService
} from "./entitysport.service.js";

/* ===============================
   SERIES
================================ */

export const syncSeries = async (req, res) => {
  try {

    const count = await syncSeriesService();

    res.json({
      success: true,
      message: `${count} series synced`
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};


/* ===============================
   TEAMS
================================ */

export const syncTeams = async (req, res) => {

  try {

    const { series_id } = req.params;

    const count = await syncTeamsService(series_id);

    res.json({
      success: true,
      message: `${count} teams synced`
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }

};


/* ===============================
   MATCHES
================================ */

export const syncMatches = async (req, res) => {

  try {

    const { series_id } = req.params;

    const count = await syncMatchesService(series_id);

    res.json({
      success: true,
      message: `${count} matches synced`
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }

};


/* ===============================
   PLAYERS
================================ */

export const syncPlayers = async (req, res) => {

  try {

    const { match_id } = req.params;

    const count = await syncPlayersService(match_id);

    res.json({
      success: true,
      message: `${count} players synced`
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }

};


/* ===============================
   PLAYING XI
================================ */

export const syncPlayingXI = async (req, res) => {

  try {

    const { match_id } = req.params;

    const count = await syncPlayingXIService(match_id);

    res.json({
      success: true,
      message: `${count} playing XI synced`
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }

};


/* ===============================
   PLAYER POINTS
================================ */

export const syncPlayerPoints = async (req, res) => {

  try {

    const { match_id } = req.params;

    const count = await syncPlayerPointsService(match_id);

    res.json({
      success: true,
      message: `${count} player points synced`
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }

};