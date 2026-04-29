import jwt from "jsonwebtoken";
import db from "../../config/db.js";
import { signupSchema, loginSchema, sendOtpSchema, verifyOtpSchema } from "../auth/auth.validation.js";

import {
  signupService,
  sendLoginOtpService,
  loginService,
  requestSignupOtpService,
  adminLoginService,
  updateProfileService,
  verifyEmailLinkService,
  requestContactChangeService,
  verifyOldContactService,
  verifyNewContactService,
} from "../auth/auth.service.js";
import { getClientIp } from "../../utils/ip.js";
import redis from "../../config/redis.js";

// ─────────────────────────────────────────────────────────────────────────────
// SIGNUP — step 1: request OTP
// ─────────────────────────────────────────────────────────────────────────────

export const signup = async (req, res) => {
  try {
    await signupSchema.validateAsync(req.body);
    const result = await requestSignupOtpService(req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.details?.[0]?.message || err.message,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RESEND SIGNUP OTP
// Fix: OTP never returned in production
// ─────────────────────────────────────────────────────────────────────────────

export const resendSignupOtp = async (req, res) => {
  try {
    const { mobile } = req.body;
    const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

    const [rows] = await db.query(
      "SELECT age_verified FROM kyc_sessions WHERE mobile = ?",
      [normalizedMobile]
    );

    if (!rows.length)
      return res.status(400).json({ success: false, message: "KYC session not found" });

    if (rows[0].age_verified !== 1)
      return res.status(400).json({ success: false, message: "Complete KYC verification first" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await redis.set(`SIGNUP_OTP:${normalizedMobile}`, otp, { ex: 300 });

    res.json({
      success: true,
      message: "OTP resent successfully",
    
      ...(process.env.NODE_ENV !== "production" && { otp }),
    });
  } catch (err) {
   
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY SIGNUP OTP — step 2: creates account + sends verification email
// ─────────────────────────────────────────────────────────────────────────────

export const verifySignupOtp = async (req, res) => {
  try {
    await verifyOtpSchema.validateAsync(req.body);
    const result = await signupService(req.body);
    return res.status(201).json(result);
  } catch (err) {
    const message = err.details?.[0]?.message || err.message;

    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ success: false, message: "Mobile or email already registered" });

    const knownErrors = {
      "OTP expired":                                        400,
      "Invalid OTP":                                        400,
      "Signup session expired":                             400,
      "Invalid signup session data":                        400,
      "Invalid signup session: missing name":               400,
      "Invalid signup session: missing email":              400,
      "Failed to generate unique usercode, please try again": 500,
      "Server busy, please try again":                      503,
    };

    const status = knownErrors[message] ?? 400;
    return res.status(status).json({ success: false, message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SEND LOGIN OTP
// ─────────────────────────────────────────────────────────────────────────────

export const sendLoginOtp = async (req, res) => {
  try {
    await sendOtpSchema.validateAsync(req.body);
    const result = await sendLoginOtpService(req.body);
    res.status(200).json({
      success: true,
      message: result.message,
      ...(process.env.NODE_ENV !== "production" && { otp: result.otp }),
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────

// export const login = async (req, res) => {
//   try {
//     await loginSchema.validateAsync(req.body);
//     const ipAddress = getClientIp(req);
//     const user      = await loginService(req.body, ipAddress);

//     const token = jwt.sign(
//       { id: user.id, usercode: user.usercode, email: user.email },
//       process.env.JWT_SECRET,
//       { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
//     );

//     res.status(200).json({ success: true, message: "Login successful", token, data: user });
//   } catch (err) {
//     res.status(400).json({ success: false, message: err.message });
//   }
// };

export const login = async (req, res) => {
  try {
    await loginSchema.validateAsync(req.body);
    const ipAddress = getClientIp(req);

    // ✅ Device info
    const deviceInfo = {
      device_id:   req.body.device_id   || null,
      device_name: req.body.device_name || null,
      device_type: req.body.device_type || null,
      push_token:  req.body.push_token  || null,
        user_agent:  req.headers['user-agent'] || null, 
    };

    const user = await loginService(req.body, ipAddress, deviceInfo);

    const token = jwt.sign(
      { id: user.id, usercode: user.usercode, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.status(200).json({ success: true, message: "Login successful", token, data: user });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};
// ─────────────────────────────────────────────────────────────────────────────
// ADMIN LOGIN
// ─────────────────────────────────────────────────────────────────────────────

export const adminLogin = async (req, res) => {
  try {
    const ipAddress = getClientIp(req);
    const admin     = await adminLoginService(req.body, ipAddress);

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role, type: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({ success: true, token, data: admin });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// VERIFY EMAIL LINK — GET /api/auth/verify-email?token=xxx
// Called when user clicks the link in their email
// Sets email_verify = 1 in users table
// ─────────────────────────────────────────────────────────────────────────────

export const verifyEmailLink = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token)
      return res.status(400).json({ success: false, message: "Token missing" });

    await verifyEmailLinkService(token);

    return res.status(200).send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: green;">✅ Email Verified Successfully!</h2>
          <p>You can now login to the app.</p>
        </body>
      </html>
    `);
  } catch (err) {
   
    return res.status(400).send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2 style="color: red;">❌ Verification Failed</h2>
          <p>${err.message}</p>
        </body>
      </html>
    `);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE PROFILE
// ─────────────────────────────────────────────────────────────────────────────

export const updateProfile = async (req, res) => {
  try {
    const result = await updateProfileService(req.user.id, req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT CHANGE (email / mobile)
// ─────────────────────────────────────────────────────────────────────────────

export const requestContactChange = async (req, res) => {
  try {
    const userId = req.user.id;
    const { type, newValue } = req.body;

    if (!type || !newValue)
      return res.status(400).json({ success: false, message: "type and newValue are required" });

    if (!["email", "mobile"].includes(type))
      return res.status(400).json({ success: false, message: "Invalid type. Must be email or mobile" });

    const result = await requestContactChangeService(userId, type, newValue);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const verifyOldContact = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp)
      return res.status(400).json({ success: false, message: "OTP required" });

    const result = await verifyOldContactService(req.user.id, otp);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const verifyNewContact = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp)
      return res.status(400).json({ success: false, message: "OTP required" });

    const result = await verifyNewContactService(req.user.id, otp);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOGOUT
// Fix: authHeader null guard added
// ─────────────────────────────────────────────────────────────────────────────

export const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    // ✅ Fix: guard against missing header
    if (!authHeader || !authHeader.startsWith("Bearer "))
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const token   = authHeader.split(" ")[1];
    const decoded = jwt.decode(token);

    if (!decoded?.exp)
      return res.status(400).json({ success: false, message: "Invalid token" });

    const expiry = decoded.exp - Math.floor(Date.now() / 1000);

    if (expiry > 0) {
      await redis.set(`BLACKLIST:${token}`, "logout", { EX: expiry });
    }

    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};