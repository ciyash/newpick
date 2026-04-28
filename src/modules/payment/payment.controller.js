// import stripe from "../../middlewares/strip.js";



// export const testStripe = async (req, res) => {
//   try {
//     const paymentIntent = await stripe.paymentIntents.create({
//       amount: 1000, // £10
//       currency: "gbp",
//       automatic_payment_methods: { enabled: true },
//     });

//     res.json(paymentIntent);
//   } catch (err) {
//     console.log(err);
//     res.status(500).json({ error: err.message });
//   }
// };


// export const createDepositPayment = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { amount } = req.body;

//     if (!amount || amount < 0.3) {
//       throw new Error("Minimum £0.30");
//     }

//     const paymentIntent = await stripe.paymentIntents.create({
//       amount: Math.round(amount * 100),
//       currency: "gbp",
//       automatic_payment_methods: { enabled: true },
//       metadata: {
//         userId: userId.toString(),
//         type: "wallet_deposit"
//       }
//     });

//     res.json({
//       success: true,
//       clientSecret: paymentIntent.client_secret
//     });

//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };
// export const getStripeConfig = async (req, res) => {
//   try {

//     res.json({
//       success: true,
//       publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
//     });

//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: err.message
//     });
//   }
// };


  

import stripe from "../../middlewares/strip.js";

export const createDepositPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    const sanitizedAmount = Math.round(Number(amount) * 100) / 100;

    if (isNaN(sanitizedAmount) || sanitizedAmount <= 0)
      return res.status(400).json({ success: false, message: "Invalid amount" });
    if (sanitizedAmount < 10)
      return res.status(400).json({ success: false, message: "Minimum deposit is £10" });
    if (sanitizedAmount > 2000)
      return res.status(400).json({ success: false, message: "Maximum deposit is £2000" });

    const paymentIntent = await stripe.paymentIntents.create({
      amount:   Math.round(sanitizedAmount * 100), // pence లో
      currency: "gbp",
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId: String(userId),
        type:   "wallet_deposit",
      },
    });

    res.json({
      success:      true,
      clientSecret: paymentIntent.client_secret,
    });

  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getStripeConfig = async (req, res) => {
  try {
    res.json({
      success:        true,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const testStripe = async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   1000,
      currency: "gbp",
      automatic_payment_methods: { enabled: true },
    });
    res.json(paymentIntent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};