import { Router } from "express";
import { getKycSdkToken, kycComplete } from "./kyc.controller.js";
import { sumsubWebhook } from "./kyc.webhook.js";


const router=Router()

router.get("/token",  getKycSdkToken); 

router.post("/webhook", sumsubWebhook);

router.post("/kyc-completed", kycComplete);

export default router