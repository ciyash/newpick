import express from "express";
import { startBankVerification, stripeWebhook } from "./bank.controller.js";

const router = express.Router();

router.post("/verify-bank", startBankVerification);

router.post("/stripe-webhook", stripeWebhook);

export default router;

  