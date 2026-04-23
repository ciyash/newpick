import db from "../../config/db.js";
import { createOnboardingLinkService, createStripeAccountService } from "./bank.service.js";
import { logActivity } from "../../utils/activity.logger.js";


export const startBankVerification = async (req, res) => {

  try {

  
    const userId = req.user.id;

    const [[user]] = await db.query(
      `SELECT email, stripe_account_id FROM users WHERE id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let accountId = user.stripe_account_id;

    if (!accountId) {
      accountId = await createStripeAccountService(userId, user.email);
    }

    const url = await createOnboardingLinkService(accountId);

    logActivity({
      userId,
      type:        "profile",
      sub_type:    "bank_verification_started",
      title:       "Bank Verification Started",
      description: "Stripe bank onboarding link generated",
      icon:        "bank",
    });

    res.json({
      success: true,
      url
    });

  } catch (error) {

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

      const [[user]] = await db.query(
        `SELECT id FROM users WHERE stripe_account_id = ? LIMIT 1`,
        [account.id]
      );

      if (user) {
        logActivity({
          userId:      user.id,
          type:        "profile",
          sub_type:    "bank_verified",
          title:       "Bank Account Verified",
          description: "Stripe bank account verified — payouts enabled",
          icon:        "bank",
        });
      }

    }

  }

  res.json({ received: true });
};