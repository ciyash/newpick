import express from "express";
import { addMoney,  getMyWallet,getMyTransactions, deleteTransactionsByUser,getMyAnalytics} from "./wallet.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";


const router = express.Router();  

router.post("/add-money", authenticate, addMoney);

router.get("/my-wallet", authenticate, getMyWallet);
    
router.get("/my-transactions", authenticate, getMyTransactions);

router.delete("/:userid", authenticate, deleteTransactionsByUser);

router.get("/analytics/summary", authenticate, getMyAnalytics);



export default router;
