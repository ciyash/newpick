import { generateUCTTeamsService } from "./uct.generator.service.js";


export const generateUCTTeams = async (req, res) => {
  try {

    const userId = req.user.id;

    const teams = await generateUCTTeamsService(
      userId,
      req.body
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