import db from "../../config/db.js";
import { createOnboardingLinkService, createStripeAccountService } from "./bank.service.js";


export const startBankVerification = async (req, res) => {

  try {

    console.log("User:", req.user);

    const userId = req.user.id;

    const [[user]] = await db.query(
      `SELECT email, stripe_account_id FROM users WHERE id = ?`,
      [userId]
    );

    console.log("DB User:", user);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let accountId = user.stripe_account_id;

    if (!accountId) {
      accountId = await createStripeAccountService(userId, user.email);
    }

    const url = await createOnboardingLinkService(accountId);

    res.json({
      success: true,
      url
    });

  } catch (error) {

    console.error("BANK VERIFY ERROR:", error);

    res.status(500).json({
      success: false,
      message: error.message
    });

  }
};


export const stripeWebhook = async (req, res) => {

  const sig = req.headers["stripe-signature"];

  let event;

  try {

    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

  } catch (err) {

    return res.status(400).send(`Webhook Error: ${err.message}`);

  }

  if (event.type === "account.updated") {

    const account = event.data.object;

    if (account.payouts_enabled) {

      await db.query(
        `UPDATE users SET bank_verified = 1 WHERE stripe_account_id = ?`,
        [account.id]
      );

    }

  }

  res.json({ received: true });
};