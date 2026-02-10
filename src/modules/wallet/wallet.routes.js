import express from "express";
import { addMoney,  deductForContest, getMyWallet,getMyTransactions} from "./wallet.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";


const router = express.Router();

router.post("/add-money", authenticate, addMoney);

router.post("/deduct-for-contest", authenticate, deductForContest);

router.get("/my-wallet", authenticate, getMyWallet);
    
router.get("/my-transactions", authenticate, getMyTransactions);

export default router;
