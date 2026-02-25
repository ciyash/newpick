import stripe from "../../middlewares/strip.js";
import { addDepositService } from "../wallet/wallet.service.js";


// export const stripeWebhook = async (req, res) => {
//   try {
//     const sig = req.headers["stripe-signature"];

//     const event = stripe.webhooks.constructEvent(
//       req.body,
//       sig,
//       process.env.STRIPE_WEBHOOK_SECRET
//     );

//     if (event.type === "payment_intent.succeeded") {
//       const paymentIntent = event.data.object;

//       // 🔐 Check type
//       if (paymentIntent.metadata.type === "wallet_deposit") {

//         const userId = paymentIntent.metadata.userId;

//         // 💰 Convert pence → pounds
//         const amount = paymentIntent.amount / 100;

//         console.log("💰 Payment success:", userId, amount);

//         // ⭐ ADD TO WALLET HERE
//         await addDepositService(userId, amount);

//         console.log("✅ Wallet updated");
//       }
//     }

//     res.json({ received: true });

//   } catch (err) {
//     console.error("Webhook error:", err.message);
//     res.status(400).send(`Webhook Error: ${err.message}`);
//   }
// };

// export const stripeWebhook = async (req, res) => {
//   try {
//     const sig = req.headers["stripe-signature"];

//     const event = stripe.webhooks.constructEvent(
//       req.body,
//       sig,
//       process.env.STRIPE_WEBHOOK_SECRET
//     );

//     if (event.type === "payment_intent.succeeded") {
//       const paymentIntent = event.data.object;

//       const userId = paymentIntent.metadata.userId;
//       const amount = paymentIntent.amount / 100;

//       console.log("💰 Payment success:", userId, amount);

     
//     }

//     res.json({ received: true });

//   } catch (err) {
//     console.error("Webhook error:", err.message);
//     res.status(400).send(`Webhook Error: ${err.message}`);
//   }
// };



export const stripeWebhook = async (req, res) => {
  try {
    const sig = req.headers["stripe-signature"];

    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log("🔥 Event:", event.type);

    // ⭐ PAYMENT SUCCESS
    if (event.type === "payment_intent.succeeded") {

      const paymentIntent = event.data.object;

      // 🔐 Only wallet deposits
      if (paymentIntent.metadata.type === "wallet_deposit") {

        const userId = paymentIntent.metadata.userId;

        // pence → pounds
        const amount = paymentIntent.amount / 100;

        console.log("💰 Deposit:", userId, amount);

        // ⭐ ADD TO WALLET
        await addDepositService(userId, amount);

        console.log("✅ Wallet updated");
      }
    }

    res.json({ received: true });

  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};