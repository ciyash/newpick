
import {Router} from "express";

import { createDepositPayment, getStripeConfig, testStripe } from "./payment.controller.js"; 
import { authenticate } from "../../middlewares/auth.middleware.js";


const router = Router();

router.post("/deposit", authenticate, createDepositPayment);

router.get("/test-stripe", authenticate, testStripe);

router.get("/stripe/config", authenticate, getStripeConfig);

export default router;

  