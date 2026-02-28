import jwt from "jsonwebtoken";
import db from "../config/db.js";

/* ================= TOKEN ERROR MESSAGES ================= */

const TOKEN_ERRORS = {
  TokenExpiredError: "Session expired, please login again",
  JsonWebTokenError: "Invalid token",
  NotBeforeError:    "Token not yet active",
};

/* ================= AUTHENTICATE ================= */

export const authenticate = (req, res, next) => {
  try {

    /* ── Extract Token ── */
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authorization header missing or malformed" });
    }

    const token = authHeader.split(" ")[1];

    /* ── Verify Token ── */
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const message = TOKEN_ERRORS[err.name] || "Token verification failed";
      return res.status(401).json({ success: false, message });
    }

    /* ── Attach User to Request ── */
    req.user = decoded;
    next();

  } catch (err) {
    console.error("Authenticate unexpected error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

/* ================= CHECK ACCOUNT ACTIVE ================= */

export const checkAccountActive = async (req, res, next) => {
  try {

    /* ── Fetch Account Status ── */
    const [[user]] = await db.query(
      `SELECT account_status, pause_end FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });  // ✅ 404 not 401
    }

    /* ── Deleted Account ── */
    if (user.account_status === "deleted") {
      return res.status(403).json({ success: false, message: "Your account has been deleted. Please contact support." });
    }

    /* ── Auto Resume if Pause Expired ── */
    if (user.account_status === "paused" && user.pause_end && new Date(user.pause_end) <= new Date()) {
      await db.query(
        `UPDATE users SET account_status = 'active', pause_start = NULL, pause_end = NULL WHERE id = ?`,
        [req.user.id]
      );
      return next();
    }

    /* ── Still Paused ── */
    if (user.account_status === "paused") {
      return res.status(403).json({
        success:    false,
        message:    "Your account is temporarily paused",
        pausedTill: user.pause_end
      });
    }

    /* ── Active ── */
    next();

  } catch (err) {
    console.error("CheckAccountActive error:", err);
    return res.status(500).json({ success: false, message: "Account check failed" });
  }
};