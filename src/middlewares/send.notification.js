
import { sendNotification } from "./notification.service.js";
import db from "../config/db.js";
export const saveFcmToken = async (req, res) => { 
  const { fcm_token } = req.body;
  const userId = req.user.id;

  if (!fcm_token) {
    return res.status(400).json({ success: false, message: "Token required" });
  }

  await db.execute(
    `INSERT INTO user_fcm_tokens (user_id, fcm_token)
     VALUES (?, ?)`,
    [userId, fcm_token]
  );

  res.json({ success: true });
};





export const testNotification = async (req, res) => {
  try {
    const { token } = req.body;

    const response = await sendNotification(
      token,
      "PICK2WIN 🔥",
      "Notification working bro 😎"
    );

    res.json({ success: true, response });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
};
