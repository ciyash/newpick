
import jwt from "jsonwebtoken";
import { signupSchema, loginSchema,sendOtpSchema, verifyOtpSchema } from "../auth/auth.validation.js";
import { signupService,sendLoginOtpService, loginService,requestSignupOtpService,adminLoginService } from "../auth/auth.service.js";
import { getClientIp } from "../../utils/ip.js";


export const signup = async (req, res) => {
  try {
    await signupSchema.validateAsync(req.body);

    const result = await requestSignupOtpService(req.body);

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.details?.[0]?.message || err.message
    });
  }
};


export const verifySignupOtp = async (req, res) => {
  try {
    await verifyOtpSchema.validateAsync(req.body);

    const result = await signupService(req.body);

    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.details?.[0]?.message || err.message,
    });
  }
};




export const sendLoginOtp = async (req, res) => {
  try {
    await sendOtpSchema.validateAsync(req.body);

    const result = await sendLoginOtpService(req.body);

    res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      otp: result.otp   // 👈 OTP in response
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};



export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) throw new Error("Token missing");

    const [[user]] = await db.query(
      "SELECT id, emailverify FROM users WHERE email_token = ?",
      [token]
    );

    if (!user) throw new Error("Invalid or expired token");

    if (user.emailverify === 1) {
      return res.redirect(`${process.env.FRONTEND_URL}/email-verified?status=already`);
    }

    await db.query(
      "UPDATE users SET emailverify = 1, email_token = NULL WHERE id = ?",
      [user.id]
    );

    // Redirect to frontend success page
    res.redirect(`${process.env.FRONTEND_URL}/email-verified?status=success`);
  } catch (err) {
    console.error("Email verification error:", err.message);
    // Redirect to frontend error page
    res.redirect(`${process.env.FRONTEND_URL}/email-verified?status=failed`);
  }
};



export const login = async (req, res) => {
  try {
    await loginSchema.validateAsync(req.body);

    const user = await loginService(req.body);

    const token = jwt.sign(
      {
        id: user.id,        // DB primary key
        usercode: user.usercode
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: {
        usercode: user.usercode,
        email: user.email,
        name: user.name
      }
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

//admin login

export const adminLogin = async (req, res) => {
  try {

     console.log("Admin Login:", req.body);
     
    const ipAddress = getClientIp(req);

    const admin = await adminLoginService(req.body, ipAddress);

    

    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        type: "admin"
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({
      success: true,
      token,
      data: admin
    });
  } catch (err) {
    res.status(401).json({
      success: false,
      message: err.message
    });
  }
};

