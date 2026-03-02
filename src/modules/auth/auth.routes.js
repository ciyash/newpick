import { Router } from "express";
import {
  signup,
  login,
  sendLoginOtp,
  verifySignupOtp,
  adminLogin,
  updateProfile,
  getKycSdkToken
} from "../auth/auth.controller.js";
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";

const router = Router();

router.post("/signup",signup);
router.get("/kyc-token",getKycSdkToken)

router.post("/verify-signup", verifySignupOtp);
router.post("/login/send-otp", sendLoginOtp);
router.post("/login", login);
router.post("/admin/login", adminLogin);   
router.patch("/update-profile",authenticate,checkAccountActive,updateProfile);

export default router;
