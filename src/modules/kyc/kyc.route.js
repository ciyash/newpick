import { Router } from "express";
import { getKycSdkToken } from "./kyc.controller.js";
import { sumsubWebhook } from "./kyc.webhook.js";


const router=Router()

router.get("/token",  getKycSdkToken); 

router.post("/webhook", sumsubWebhook);

export default router