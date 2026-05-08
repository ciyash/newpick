// services/createStripeAccountService.js

import { stripeConnect  } from "../../config/strip.js"
import db from "../../config/db.js"

export const createStripeAccountService = async (userId, email) => {
 
  const account = await stripeConnect.accounts.create({
    type: "express",
    country: "GB",
    email: email,
    capabilities: {
      transfers: { requested: true }
    }
  });

  await db.query(
    `UPDATE users 
     SET stripe_account_id = ?
     WHERE id = ?`,
    [account.id, userId]
  );

  return account.id;
};



export const createOnboardingLinkService = async (accountId) => {

  const link = await stripeConnect.accountLinks.create({
    account: accountId,
    refresh_url: "https://pick2win.com/retry",
    return_url: "https://pick2win.com/success",
    type: "account_onboarding"
  });

  return link.url;
};


export const getBankDetailsService = async (stripeAccountId) => {

  const account = await stripeConnect.accounts.retrieve(stripeAccountId, {
    expand: ["external_accounts"],
  });

  const bankAccounts = account.external_accounts?.data?.filter(
    (acc) => acc.object === "bank_account"
  );

  if (!bankAccounts || bankAccounts.length === 0) return null;

  // account holder name — bank lo lekapothe stripe account name use cheyyi
  const fallbackName =
    account.individual?.first_name
      ? `${account.individual.first_name} ${account.individual.last_name ?? ""}`.trim()
      : account.business_profile?.name ?? null;

  return bankAccounts.map((bank) => ({
    bank_name:      bank.bank_name,
    account_holder: bank.account_holder_name ?? fallbackName,
    last4:          bank.last4,
    currency:       bank.currency,
    country:        bank.country,
    status:         bank.status,
    is_default:     bank.default_for_currency,
  }));
};