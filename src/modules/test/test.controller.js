import { getAllPlayersService } from "./test.service.js";

export const getAllPlayers = async (req, res) => {
  try {

    const data = await getAllPlayersService();

    res.json({
      success: true,
      data
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: err.message
    });

  }
};