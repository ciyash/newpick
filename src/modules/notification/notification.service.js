import db from "../../config/db.js";
import { sendPushNotification } from "../../utils/expo.push.js"

export const notifyUser = async (userId, title, body) => {

  const [rows] = await db.query(
    "SELECT expo_push_token FROM users WHERE id=?",
    [userId]
  );

  if (!rows.length) return;

  const token = rows[0].expo_push_token;

  if (!token) return;

  await sendPushNotification(token, title, body);

};