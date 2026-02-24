import { generateUCTTeamsService, getUserUCTTeamsService } from "./uct.generator.service.js";


export const generateUCTTeams = async (req, res) => {
  try {

    const userId = req.user.id;

    const result = await generateUCTTeamsService(
      userId,
      req.body
    );

    return res.json({
      success: true,
      message: "UCT teams generated successfully",
      ...result
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

export const getUserUCTTeams = async (req, res) => {
  try {
    const userId = req.user.id;
    const { matchId } = req.query;

    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: "matchId required"
      });
    }

    const teams = await getUserUCTTeamsService(
      userId,
      matchId
    );

    res.json({
      success: true,
      teams
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};