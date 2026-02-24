import stripe from "../../middlewares/strip.js";


// export const testStripe = async (req, res) => {
//   const paymentIntent = await stripe.paymentIntents.create({
//     amount: 1000, // £10 (1000 pence)
//     currency: "gbp"
//   });

//   res.json(paymentIntent);
// };

export const testStripe = async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000, // £10
      currency: "gbp",
      automatic_payment_methods: { enabled: true },
    });

    res.json(paymentIntent);
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
};



export const createDepositPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body; // ⭐ pounds

    // 🔴 Minimum £0.30 (Stripe UK rule)
    if (!amount || amount < 0.3) {
      throw new Error("Minimum deposit £0.30");
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // convert £ → pence
      currency: "gbp",
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId,
        type: "wallet_deposit"
      }
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.client_secret
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getStripeConfig = async (req, res) => {
  try {

    res.json({
      success: true,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};