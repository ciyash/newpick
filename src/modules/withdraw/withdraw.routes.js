import express from "express";
import {
  requestWithdraw,
  approveWithdraw,
  rejectWithdraw
} from "./withdraw.controller.js";

import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";
const router = express.Router();

/* ================= USER ================= */
router.post("/request", authenticate, checkAccountActive,  requestWithdraw);

/* ================= ADMIN ================= */
router.post("/approve", adminAuth(), approveWithdraw);
router.post("/reject", adminAuth(), rejectWithdraw);

export default router;   