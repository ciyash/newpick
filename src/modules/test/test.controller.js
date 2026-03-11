import { getAllPlayersService } from "./test.service.js";

import { notifyUser } from "../notification/notification.service.js"

export const testNotification = async (req, res) => {
  try {

    const { userId } = req.params;

    await notifyUser(
      userId,
      "Test Notification",
      "This is a test notification from PICK2WIN 🚀"
    );

    res.json({
      success: true,
      message: "Notification sent successfully"
    });

  } catch (err) {

    console.error("Notification test error:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });

  }
};

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