// services/createStripeAccountService.js

import { stripe } from "../../config/strip.js"
import db from "../../config/db.js"

export const createStripeAccountService = async (userId, email) => {

  const account = await stripe.accounts.create({
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

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: "https://pick2win.com/retry",
    return_url: "https://pick2win.com/success",
    type: "account_onboarding"
  });

  return link.url;
};