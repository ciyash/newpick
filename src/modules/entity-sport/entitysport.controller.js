import {
  syncCompetitionsService,
  syncMatchesService,
  syncMatchSquadService
} from "./entitysport.service.js";

  
export const syncCompetitions = async (req, res) => {

  try {

    const count = await syncCompetitionsService();

    res.json({
      success: true,
      message: `${count} competitions synced`
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};


export const syncMatches = async (req, res) => {

  try {

    const { competition_id } = req.params;

    const count = await syncMatchesService(competition_id);

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


export const syncMatchSquad = async (req, res) => {

  try {

    const { match_id } = req.params;

    const count = await syncMatchSquadService(match_id);

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