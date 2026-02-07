/**
 * PICK2WIN – Wallet Constants
 * Single source of truth for all wallet rules
 */

// 💰 Deposit rules
export const MIN_DEPOSIT_AMOUNT = 10;        // £10 per transaction
export const MAX_MONTHLY_DEPOSIT = 1000;     // £1000 per calendar month

// 🎁 Bonus rules
export const JOINING_BONUS = 5;              // £5 on successful signup
export const FIRST_REFERRAL_BONUS = 5;       // £5 for first referral
export const OTHER_REFERRAL_BONUS = 3;       // £3 for subsequent referrals
export const BONUS_USAGE_PERCENT = 0.05;     // Max 5% of contest entry fee

// 💸 Withdrawal rules
export const MIN_WITHDRAW_AMOUNT = 10;       // £10 minimum withdrawal
export const WITHDRAW_KYC_REQUIRED = true;   // KYC gate

// 🧾 Wallet types (for ledger / clarity)
export const WALLET_TYPES = Object.freeze({
  DEPOSIT: "DEPOSIT",
  WITHDRAW: "WITHDRAW",
  BONUS: "BONUS"
});

// 📊 Transaction types (ledger)
export const TRANSACTION_TYPES = Object.freeze({
  CREDIT: "CREDIT",
  DEBIT: "DEBIT"
});

// 📅 Utility: year-month format (YYYY-MM)
export const getCurrentYearMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
