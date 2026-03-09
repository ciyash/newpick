import { Router } from "express";
import {
  signup,
  login,
  sendLoginOtp,
  verifySignupOtp,
  adminLogin,  
  updateProfile,
  getKycSdkToken,
  sendEmailVerification,
  verifyEmailLink,
  requestContactChange,
  verifyOldContact,
  verifyNewContact
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

router.post("/send-email-verification", sendEmailVerification);
router.get("/verify-email", verifyEmailLink);

// CONTACT CHANGE ROUTES
router.post("/request-contact-change",authenticate, requestContactChange);

router.post("/verify-old-contact",authenticate,verifyOldContact);

router.post("/verify-new-contact",authenticate,verifyNewContact);

export default router;
    