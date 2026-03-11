import express from "express";
import { savePushToken, testNotification  } from "./notification.controller.js";

const router = express.Router();

router.post("/push-token", savePushToken );

router.get("/test", testNotification);

export default router;