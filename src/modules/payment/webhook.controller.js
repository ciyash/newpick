import stripe from "../../middlewares/strip.js";
import { addDepositService } from "../wallet/wallet.service.js";


export const stripeWebhook = async (req, res) => {
  try {
    const sig = req.headers["stripe-signature"];

    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("🔥 Event:", event.type);

    // ⭐ ONLY HANDLE SUCCESS PAYMENTS
    if (event.type === "payment_intent.succeeded") {

      const paymentIntent = event.data.object;

      // 🔐 Process ONLY wallet deposits
      if (paymentIntent.metadata.type !== "wallet_deposit") {
        console.log("⚠️ Not a wallet deposit, skipping");
        return res.json({ received: true });
      }

      const userId = paymentIntent.metadata.userId;
      const amount = paymentIntent.amount / 100;
      const paymentIntentId = paymentIntent.id;

      if (!userId) {
        console.error("❌ userId missing in metadata");
        return res.json({ received: true });
      }

      try {
        // ⭐ PASS paymentIntentId for transaction reference
        await addDepositService(userId, amount, paymentIntentId);

        console.log("✅ Wallet + Transaction updated");

      } catch (err) {
        console.error("❌ Wallet update failed:", err.message);

        // 🔥 OPTIONAL: Save failed webhook event for retry
      }
    }

    res.json({ received: true });

  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};

