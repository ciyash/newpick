import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import redis from "../config/redis.js";

const TOKEN_ERRORS = {
  TokenExpiredError: "Session expired, please login again",
  JsonWebTokenError: "Invalid token",
  NotBeforeError:    "Token not yet active",
};

export const adminLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,  // 1 minute
  max: 100,
  message: { success: false, message: "Too many requests" }
});
export const adminAuth = (roles = []) => {
  return async (req, res, next) => {
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

      if (!decoded?.id || !decoded?.role || !decoded?.email) {
        return res.status(401).json({ success: false, message: "Invalid token payload" });
      }
      const isBlocked = await redis.get(`blocklist:${token}`);
      if (isBlocked) {
        return res.status(401).json({ success: false, message: "Token has been invalidated" });
      }

      if (decoded.type !== "admin") {
        return res.status(403).json({ success: false, message: "Access denied: not an admin account" });
      }

      if (roles.length && !roles.includes(decoded.role)) {
        return res.status(403).json({ success: false, message: "Access denied: insufficient permissions" });
      }
      req.admin = decoded;
      next();

    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.error("AdminAuth unexpected error:", err);
      }
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  };
};