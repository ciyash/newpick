import { Router } from "express";
import {
  signup,
  login,
  sendLoginOtp,
  verifySignupOtp,
  adminLogin,  
  updateProfile,
  sendEmailVerification,
  verifyEmailLink,
  requestContactChange,
  verifyOldContact,
  verifyNewContact,
  logout,
  resendSignupOtp
} from "../auth/auth.controller.js";
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";

const router = Router();

// ADMIN LOGIN
router.post("/admin/login", adminLogin);   
router.post("/resend-otp", resendSignupOtp);

  
//USER ROUTES
router.post("/signup",signup);
router.post("/verify-signup", verifySignupOtp);
router.post("/login/send-otp", sendLoginOtp);
router.post("/login", login);

router.patch("/update-profile",authenticate,checkAccountActive,updateProfile);

// EMAIL VERIFICATION ROUTES
router.post("/send-email-verification", sendEmailVerification);
router.get("/verify-email", verifyEmailLink);

// CONTACT CHANGE ROUTES  

router.post("/request-contact-change",authenticate, requestContactChange);

router.post("/verify-old-contact",authenticate,verifyOldContact);

router.post("/verify-new-contact",authenticate,verifyNewContact);

router.post("/logout", authenticate, logout);

export default router;
  