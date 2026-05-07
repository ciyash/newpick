import express from "express";
import { startBankVerification } from "./bank.controller.js";

const router = express.Router();

router.post("/verify-bank", startBankVerification);

export default router;

    