import express from "express";
import {
  buySubscription,
  getSubscriptionStatus,
  fetchAllPackages
} from "./subscription.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/buy", authenticate, buySubscription);

router.get("/status", authenticate, getSubscriptionStatus);
router.get("/getallsubscriptions", authenticate, fetchAllPackages);

export default router;
