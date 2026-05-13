
import {   manualPlayingXIService,
  manualPlayerPointsService,
  getMatchSquadsOnlyService} from "./test.service.js";



export const getMatchSquadsOnly = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await getMatchSquadsOnlyService(id);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("getMatchSquadsOnly Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};