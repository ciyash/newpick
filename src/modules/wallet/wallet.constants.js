export const MIN_DEPOSIT_AMOUNT = 10;

// 🎯 Deposit limits by category
export const CATEGORY_DEPOSIT_LIMITS = Object.freeze({
  STUDENT: 300,
  OTHERS: 1500
});

// 🎁 Bonus rules
export const JOINING_BONUS = 5;
export const FIRST_REFERRAL_BONUS = 5;
export const OTHER_REFERRAL_BONUS = 3;
export const BONUS_USAGE_PERCENTAGE = 0.05;

// 💸 Withdrawal rules
export const MIN_WITHDRAW_AMOUNT = 10;
export const WITHDRAW_KYC_REQUIRED = true;

// 🧾 Wallet types
export const WALLET_TYPES = Object.freeze({
  DEPOSIT: "deposit",
  WITHDRAW: "withdraw",
  BONUS: "bonus"
});

// 📊 Transaction types
export const TRANSACTION_TYPES = Object.freeze({
  CREDIT: "credit",
  DEBIT: "debit"
});

// 📅 Utility: YYYY-MM
export const getCurrentYearMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
