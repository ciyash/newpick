import db from "../../config/db.js";

import { sendPushNotification } from "../../utils/expo.push.js"
import { notifyUser } from "./notification.service.js";


export const savePushToken = async (req, res) => {

  try {

    let { token } = req.body;

    const userId = req.user.id;   // ✅ JWT middleware nundi

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Push token required"
      });
    }

    if (typeof token === "object") {
      token = token.data;
    }

    await db.query(
      "UPDATE users SET expo_push_token=? WHERE id=?",
      [String(token), userId]
    );

    res.json({
      success: true,
      message: "Push token saved"
    });

  } catch (err) {

    console.error("Push token error:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });

  }

};


export const testNotification = async (req, res) => {

  try {

    const userId = req.user.id;   // better than params

    await notifyUser(
      userId,
      "Test Notification",
      "This is a test notification from PICK2WIN 🚀"
    );

    res.json({
      success: true,
      message: "Notification sent"
    });

  } catch (err) {

    console.error("Notification test error:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });

  }

};