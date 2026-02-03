import express from "express";
import { getProfile } from "./user.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();
router.get("/userprofile", authenticate, getProfile);

export default router;
