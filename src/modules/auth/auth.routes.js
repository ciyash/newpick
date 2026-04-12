import { Router } from "express";
import {
  signup,
  login,
  sendLoginOtp,
  verifySignupOtp,
  adminLogin,  
  updateProfile,
  verifyEmailLink,
  requestContactChange,
  verifyOldContact,
  verifyNewContact,
  logout,
  resendSignupOtp
} from "../auth/auth.controller.js";
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";

import { sendMail } from '../../utils/send.mail.js'

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



router.get("/verify-email", verifyEmailLink);

// CONTACT CHANGE ROUTES  

router.post("/request-contact-change",authenticate, requestContactChange);

router.post("/verify-old-contact",authenticate,verifyOldContact);

router.post("/verify-new-contact",authenticate,verifyNewContact);

router.post("/logout", authenticate, logout);




router.get("/test-email", async (req, res) => {
  try {
    await sendMail({
      to: "chandrasekhar8120@gmail.com",
      subject: "Test Email from Render",
      html: "<h1>Email is working! ✅</h1>",
      text: "Email is working!"
    });
    res.json({ success: true, message: "Email sent successfully!" });
  } catch (err) {
    res.json({ 
      success: false, 
      message: err.message,
      stack: err.stack 
    });
  }
});

export default router;
  