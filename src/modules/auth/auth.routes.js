
import express from "express";
import { signup, login,sendLoginOtp,verifySignupOtp} from "../auth/auth.controller.js";

const router = express.Router();

router.post("/signup", signup);

router.post("/verify-signup", verifySignupOtp);

router.post("/login/send-otp", sendLoginOtp);

router.post("/login", login);



export default router;
