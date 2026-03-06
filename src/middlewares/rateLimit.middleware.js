import rateLimit, { ipKeyGenerator } from "express-rate-limit";

export const createTeamRateLimit = rateLimit({
  windowMs: 10 * 1000,
  max: 3,
  keyGenerator: (req) =>
    req.user?.id
      ? `create_team_user_${req.user.id}`
      : `create_team_ip_${ipKeyGenerator(req)}`,  // ✅ IPv6-safe fallback
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests. Please slow down.",
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const updateTeamRateLimit = rateLimit({
  windowMs: 10 * 1000,
  max: 5,
  keyGenerator: (req) =>
    req.user?.id
      ? `update_team_user_${req.user.id}`
      : `update_team_ip_${ipKeyGenerator(req)}`,  // ✅ IPv6-safe fallback
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests. Please slow down.",
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});