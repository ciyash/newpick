import { Router } from "express";
import { startKyc, getKycStatus, kycComplete, startAddressVerification } from "./kyc.controller.js";
import {  sumsubWebhook } from "./kyc.webhook.js";
import { authenticate } from "../../middlewares/auth.middleware.js";


const router=Router()

router.post("/token",  startKyc); 

router.post("/webhook", sumsubWebhook);

router.get("/kyc-status/:mobile",  getKycStatus);

router.post("/kyc-completed", kycComplete);  


router.post("/address-kyc",authenticate, startAddressVerification);










export default router