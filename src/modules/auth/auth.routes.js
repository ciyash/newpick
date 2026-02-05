
import { Router } from "express";
import { signup, login,sendLoginOtp,verifySignupOtp,adminLogin} from "../auth/auth.controller.js";

const router = Router();

router.post("/signup", signup);
router.post("/verifySignupOtp", verifySignupOtp);
router.post("/login/send-otp", sendLoginOtp);
router.post("/login", login);
router.post("/admin/login", adminLogin);


export default router;
