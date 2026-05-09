// ─── Auth ────────────────────────────────────────────────
export const MAX_FAILED_ATTEMPTS = 5;

// ─── Users ───────────────────────────────────────────────
export const JOINING_BONUS = 5;
export const MAX_USERCODE_RETRIES = 10;
export const MIN_AGE = 18;  
             
// login allowed conries for now
export const ALLOWED_COUNTRIES = ["GB", "IN"];

// ─── OTP ─────────────────────────────────────────────────
export const OTP_TTL_SECONDS = 300;   
export const OTP_MIN = 100000;
export const OTP_MAX = 999999;

export const NON_SUBSCRIBER_WITHDRAW_LIMIT = 2500;

// ─── Subscriptions ───────────────────────────────────────
export const PAUSE_PLANS = {
  "1d":  1,
  "7d":  7,
  "15d": 15,
  "30d": 30,
  "90d": 90,
  "180d": 180,  

};