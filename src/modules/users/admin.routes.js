import { Router } from "express";
import {
  createAdmin,
  getAdmins,
  getAdminById,
  updateAdmin,
  updateMyProfile
} from "./admin.controller.js";

import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = Router();

/**
 * Super Admin only
 */
router.post("/createemployee", adminAuth(["super_admin"]), createAdmin);

/**
 * View admins
 */
router.get("/getemployee", adminAuth(["super_admin", "sub_admin"]), getAdmins);

/**
 * View admin by ID
 */
router.get("/:id", adminAuth(["super_admin", "sub_admin"]), getAdminById);

/**
 * Update admin (role / status)
 */
router.put("/:id", adminAuth(["super_admin"]), updateAdmin);

/**
 * Update own profile
 */
router.put("/profile/me", adminAuth(), updateMyProfile);

export default router;
