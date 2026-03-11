import { Router } from "express";
import { getKycSdkToken, kycComplete } from "./kyc.controller.js";
import { getKycStatus, sumsubWebhook } from "./kyc.webhook.js";


const router=Router()

router.post("/token",  getKycSdkToken); 

router.post("/webhook", sumsubWebhook);

router.get("/kyc-status",  getKycStatus);

router.post("/kyc-completed", kycComplete);

export default router