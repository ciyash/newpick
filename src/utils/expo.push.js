import { Expo } from "expo-server-sdk";

const expo = new Expo();

export const sendPushNotification = async (token, title, body) => {

  if (!Expo.isExpoPushToken(token)) {
    console.error("Invalid Expo push token:", token);
    return;
  }

  const message = {
    to: token,
    sound: "default",
    title,
    body
  };

  try {

    await expo.sendPushNotificationsAsync([message]);

  } catch (err) {

    console.error("Push notification error:", err);

  }

};