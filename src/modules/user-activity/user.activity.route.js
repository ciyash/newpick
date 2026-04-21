import express from "express";
import {
  getMyActivity,
  requestFullHistory,
  approveFullHistory,
} from './user.activity.controller.js';
import { getFullHistoryRequests } from "./user.activity.service.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";

const router = express.Router();

// User routes
router.get("/my-activity", authenticate,checkAccountActive, getMyActivity);

router.get("/request-full",authenticate,checkAccountActive, requestFullHistory);  


// Admin routes


// GET /admin/full-history-requests?status=pending  → filter by status

router.get("/admin/full-history-requests",adminAuth(), getFullHistoryRequests);

router.post("/admin/approve", adminAuth(), approveFullHistory);


export default router; 