import jwt from "jsonwebtoken";
import db from "../../config/db.js";

import { signupSchema, loginSchema, sendOtpSchema, verifyOtpSchema } from "../auth/auth.validation.js";
import {
  signupService, sendLoginOtpService, loginService,
  requestSignupOtpService, adminLoginService, updateProfileService,
  sendEmailVerificationService,
  verifyEmailLinkService,
  requestContactChangeService,
  verifyOldContactService,
  verifyNewContactService
} from "../auth/auth.service.js";
import { getClientIp } from "../../utils/ip.js";
import redis from "../../config/redis.js";


/* ================= SIGNUP ================= */

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


export const resendSignupOtp = async (req, res) => {

  try {

    const { mobile } = req.body;

    const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

    /* 1️⃣ check KYC session */

    const [rows] = await db.query(
      "SELECT age_verified FROM kyc_sessions WHERE mobile=?",
      [normalizedMobile]
    );

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        message: "KYC session not found"
      });
    }

    /* 2️⃣ check age verification */

    if (rows[0].age_verified !== 1) {
      return res.status(400).json({
        success: false,
        message: "Complete KYC verification first"
      });
    }

    /* 3️⃣ generate OTP */

    const otp = Math.floor(100000 + Math.random() * 900000);

    /* 4️⃣ store OTP in redis */

    await redis.set(
      `SIGNUP_OTP:${normalizedMobile}`,
      otp,
      { EX: 300 } // 5 minutes
    );

    /* 5️⃣ send OTP (SMS service) */

    console.log(`Signup OTP for ${normalizedMobile}:`, otp);

    res.json({
      success: true,
      message: "OTP resent successfully"
    });

  } catch (err) {

    console.error("Resend OTP error:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });

  }

};


/* ================= VERIFY SIGNUP OTP ================= */

export const verifySignupOtp = async (req, res) => {
  try {
    await verifyOtpSchema.validateAsync(req.body);
    const result = await signupService(req.body);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.details?.[0]?.message || err.message
    });
  }
};

/* ================= SEND LOGIN OTP ================= */ 

export const sendLoginOtp = async (req, res) => {
  try {
    await sendOtpSchema.validateAsync(req.body);
    const result = await sendLoginOtpService(req.body);

    res.status(200).json({
      success: true,
      message: result.message,
      // ✅ OTP only in development for testing
      // ❌ BEFORE: always exposed to anyone
      // 🔒 PRODUCTION RESTORE: remove this line entirely
      ...(process.env.NODE_ENV !== "production" && { otp: result.otp })
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= VERIFY EMAIL ================= */

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) throw new Error("Token missing");

    // ✅ Bug 4 fixed — check token expiry in query
    // ❌ BEFORE: no expiry check — old tokens worked forever
    const [[user]] = await db.query(
      `SELECT id, emailverify
       FROM users
       WHERE email_token = ?
       AND email_token_expires > NOW()`,
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

    // ✅ Bug 5 fixed — safe redirect using URL constructor
    // ❌ BEFORE: direct string concat — open redirect risk
    const redirectUrl = new URL("/email-verified", process.env.FRONTEND_URL);
    redirectUrl.searchParams.set("status", "success");
    res.redirect(redirectUrl.toString());

  } catch (err) {
    // ✅ Safe logging — only in development
    if (process.env.NODE_ENV !== "production") console.error("Email verification error:", err);
    const redirectUrl = new URL("/email-verified", process.env.FRONTEND_URL);
    redirectUrl.searchParams.set("status", "failed");
    res.redirect(redirectUrl.toString());
  }
};

/* ================= LOGIN ================= */

// ❌ REMOVED OLD LOGIN — was missing email in JWT payload
// broke all protected routes — authenticate middleware checks decoded.email
// export const login = async (req, res) => { ... }

export const login = async (req, res) => {
  try {
    await loginSchema.validateAsync(req.body);

    const ipAddress = getClientIp(req);
    const user      = await loginService(req.body, ipAddress);

    // ✅ email included in JWT — authenticate middleware requires it
    // ❌ BEFORE: { id, usercode } only — all protected routes returned 401
    const token = jwt.sign(
      { id: user.id, usercode: user.usercode, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      data: user
    });

  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= ADMIN LOGIN ================= */

export const adminLogin = async (req, res) => {
  try {
    // ❌ REMOVED: console.log(req.body) — was logging password in plaintext

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

/* ================= UPDATE PROFILE ================= */

export const updateProfile = async (req, res) => {
  try {
    const result = await updateProfileService(req.user.id, req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/* ================= KYC SDK TOKEN ================= */

// ⭐ Sumsub section — maintained by another team, no changes made

// export const getKycSdkToken = async (req, res) => {
//   try {
//     const { mobile }       = req.query;
//     const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

//     const signupRaw = await redis.get(`SIGNUP:${normalizedMobile}`);
//     if (!signupRaw) throw new Error("Signup session expired");

//     const applicantId = await createApplicantService(normalizedMobile);

//     const path    = `/resources/accessTokens?userId=${normalizedMobile}&levelName=${process.env.SUMSUB_LEVEL}`;
//     const headers = createSumsubHeaders("POST", path, "");
//     const data    = await sumsubPost(process.env.SUMSUB_BASE_URL + path, headers);

//     res.json({ success: true, token: data.token });

//   } catch (err) {
//     const status = err.message === "Signup session expired" ? 400 : 500;
//     res.status(status).json({ success: false, message: err.message });
//   }
// };


  
export const sendEmailVerification = async (req, res) => {
  try {

    const result = await sendEmailVerificationService(req.body.email);

    res.json(result);

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const verifyEmailLink = async (req, res) => {
  try {

    const { token } = req.query;

    const result = await verifyEmailLinkService(token);

    res.json(result);

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};


/* ================= REQUEST CONTACT CHANGE ================= */

export const requestContactChange = async (req, res) => {
  try {

    const userId = req.user.id;
    const { type, newValue } = req.body;

    if (!type || !newValue) {
      return res.status(400).json({
        success: false,
        message: "type and newValue are required"
      });
    }

    if (!["email", "mobile"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid type. Must be email or mobile"
      });
    }

    const result = await requestContactChangeService(
      userId,
      type,
      newValue
    );

    res.status(200).json(result);

  } catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

  }
};


/* ================= VERIFY OLD CONTACT ================= */

export const verifyOldContact = async (req, res) => {
  try {

    const userId = req.user.id;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP required"
      });
    }

    const result = await verifyOldContactService(userId, otp);

    res.status(200).json(result);

  } catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

  }
};


/* ================= VERIFY NEW CONTACT ================= */

export const verifyNewContact = async (req, res) => {
  try {

    const userId = req.user.id;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP required"
      });
    }

    const result = await verifyNewContactService(userId, otp);

    res.status(200).json(result);

  } catch (err) {

    res.status(400).json({
      success: false,
      message: err.message
    });

  }
};




export const logout = async (req, res) => {
  try {

    const authHeader = req.headers.authorization;
    const token = authHeader.split(" ")[1];

    const decoded = jwt.decode(token);

    const expiry = decoded.exp - Math.floor(Date.now() / 1000);

    await redis.set(`BLACKLIST:${token}`, "logout", { EX: expiry });

    res.json({
      success: true,
      message: "Logged out successfully"
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: err.message
    });

  }
};