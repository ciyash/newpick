import admin from "./firebase.js";

export const sendNotification = async (token, title, body, data = {}) => {
  const message = {
    token,
    notification: {
      title,
      body
    },
    data
  };

  return await admin.messaging().send(message);
};
