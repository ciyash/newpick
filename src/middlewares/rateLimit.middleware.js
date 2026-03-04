import rateLimit from "express-rate-limit";

export const createTeamRateLimit = rateLimit({

  windowMs: 5 * 1000, // 5 seconds

  max: 3, // max 3 requests per window

  message: {
    success: false,
    message: "Too many team creation requests. Please wait."
  },

  standardHeaders: true,
  legacyHeaders: false,

});