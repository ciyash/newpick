import express from "express";
import {
  buySubscription,
  getSubscriptionStatus
} from "./subscription.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/buy", authenticate, buySubscription);

router.get("/status", authenticate, getSubscriptionStatus);

export default router;
