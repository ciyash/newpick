import express from "express";
import { getBankDetails, startBankVerification } from "./bank.controller.js";

const router = express.Router();

router.post("/verify-bank", startBankVerification);

router.get("/bank-details", getBankDetails);

export default router;

    