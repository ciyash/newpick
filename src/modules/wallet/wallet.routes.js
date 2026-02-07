import express from "express";
import { addMoney,  deductForContest, getMyWallet} from "./wallet.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";


const router = express.Router();

/**
 * 💰 Add money to Deposit Wallet
 * Rules:
 * - Min £10 per transaction
 * - Max £1000 per month
 * - UserId only from JWT
 */
router.post("/add-money", authenticate, addMoney);

/**
 * 🏆 Deduct money for Contest Join
 * Priority:
 * BONUS (≤5%) → DEPOSIT → WITHDRAW
 */
router.post("/deduct-for-contest", authenticate, deductForContest);

router.get("/my-wallet", authenticate, getMyWallet);

export default router;
