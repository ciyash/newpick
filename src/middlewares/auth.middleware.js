import jwt from "jsonwebtoken";
import db from "../config/db.js";
const TOKEN_ERRORS = {
  TokenExpiredError: "Session expired, please login again",
  JsonWebTokenError: "Invalid token",
  NotBeforeError:    "Token not yet active",
};

export const authenticate = (req, res, next) => {
  try {

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authorization header missing or malformed" });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    } catch (err) {
      const message = TOKEN_ERRORS[err.name] || "Token verification failed";
      return res.status(401).json({ success: false, message });
    }

    if (!decoded?.id || !decoded?.email) {
      return res.status(401).json({ success: false, message: "Invalid token payload" });
    }
 
    req.user = decoded;
    next();

  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.error("Authenticate error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};



export const checkAccountActive = async (req, res, next) => {
  try {

    /* ── Fetch Account Status — MySQL handles time comparison ── */
    const [[user]] = await db.query(
      `SELECT account_status, pause_end,
              pause_end <= NOW() AS pause_expired
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    /* ── Deleted Account ── */
    if (user.account_status === "deleted") {
      return res.status(403).json({ success: false, message: "Your account has been deleted. Please contact support." });
    }

    /* ── Auto Resume if Pause Expired ── */
    if (user.account_status === "paused" && user.pause_expired) {
      const [result] = await db.query(
        `UPDATE users SET account_status = 'active', pause_start = NULL, pause_end = NULL
         WHERE id = ? AND account_status = 'paused'`,
        [req.user.id]
      );
      if (result.affectedRows === 0) {
        return res.status(500).json({ success: false, message: "Failed to resume account" });
      }
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
    if (process.env.NODE_ENV !== "production") console.error("CheckAccountActive error:", err);
    return res.status(500).json({ success: false, message: "Account check failed" });
  }
};

/* ================= REQUIRE KYC ================= */

export const requireKyc = async (req, res, next) => {
  try {

    const [[user]] = await db.query(
      "SELECT age_verified FROM users WHERE id = ?",
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (!user.age_verified) {
      return res.status(403).json({ success: false, message: "Complete KYC verification first" });
    }

    next();

  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.error("RequireKyc error:", err);
    return res.status(500).json({ success: false, message: "KYC check failed" });
  }
};