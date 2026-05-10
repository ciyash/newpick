import express from "express";
import {
  requestWithdraw,
  getMyWithdrawRequests,
} from "./withdraw.controller.js";

import { requestWithdrawValidate } from "./withdraw.validation.js";

const router = express.Router();

/* ================= USER ================= */
router.post("/request",  requestWithdrawValidate, requestWithdraw);

router.get("/history", getMyWithdrawRequests);

export default router;   