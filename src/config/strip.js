import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16"
});

export const stripeConnect = new Stripe(process.env.STRIPE_CONNECT_SECRET_KEY);
