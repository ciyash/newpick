// ─── Auth ────────────────────────────────────────────────
export const MAX_FAILED_ATTEMPTS = 5;

// ─── Users ───────────────────────────────────────────────
export const JOINING_BONUS = 5;
export const MAX_USERCODE_RETRIES = 10;
export const MIN_AGE = 18;               // currently hardcoded in requestSignupOtpService too

// ─── OTP ─────────────────────────────────────────────────
export const OTP_TTL_SECONDS = 300;      // 5 min — used in both redis.set calls
export const OTP_MIN = 100000;
export const OTP_MAX = 999999;

// ─── Subscriptions ───────────────────────────────────────
export const PAUSE_PLANS = {
  "1d":  1,
  "7d":  7,
  "30d": 30,
};