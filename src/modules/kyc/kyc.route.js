import { Router } from "express";
import { startKyc, getKycStatus, kycComplete } from "./kyc.controller.js";
import {  sumsubWebhook } from "./kyc.webhook.js";


const router=Router()

router.post("/token",  startKyc); 

router.post("/webhook", sumsubWebhook);

router.get("/kyc-status/:mobile",  getKycStatus);

router.post("/kyc-completed", kycComplete);  

export default router