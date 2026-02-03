
import jwt from "jsonwebtoken";
import { signupSchema, loginSchema,sendOtpSchema } from "../auth/auth.validation.js";
import { signupService,sendLoginOtpService, loginService } from "../auth/auth.service.js";


export const signup = async (req, res) => {
  try {
    console.log("Signup hit:", req.body);
    await signupSchema.validateAsync(req.body);
    const user = await signupService(req.body);
    res.json({ success: true, message: "Signup successful", data: user });
  } catch (err) {
     const message =
      err.details?.[0]?.message || err.message || "Signup failed";
    console.log("Error:", err.message);
    res.status(400).json({ success: false, message: err.message });
  }
};

export const sendLoginOtp = async (req, res) => {
  try {
    console.log("Send OTP hit:", req.body);

    await sendOtpSchema.validateAsync(req.body);

    await sendLoginOtpService(req.body);

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (err) {
    console.error("Send OTP error:", err.message);

    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};




export const login = async (req, res) => {
  try {
    console.log("Login hit:", req.body);

    await loginSchema.validateAsync(req.body);

    // loginService returns user details
    const user = await loginService(req.body);

    // create JWT
    const token = jwt.sign(
      {
        userId: user.usercode, // or user.id
        email: user.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: user,
    });
  } catch (err) {
    console.error("Login error:", err.message);

    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};
