import stripe from "../../middlewares/strip.js";

export const testStripe = async (req, res) => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: 10, // ₹0.10 in paise
    currency: "inr"
  });

  res.json(paymentIntent);
};  



export const createDepositPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { amount } = req.body;

    if (!amount || amount < 10) {
      throw new Error("Minimum deposit ₹10");
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // rupees → paise
      currency: "inr",
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