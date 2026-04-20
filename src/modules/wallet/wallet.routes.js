import express from "express";
import { addMoney, getMyWallet, getMyTransactions, deleteTransactionsByUser, getMyAnalytics, downloadAnalyticsStatement, getMyTransactionsYear, getMyActivity } from "./wallet.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";


const router = express.Router();

router.post("/add-money", authenticate, addMoney);

router.get("/my-wallet", getMyWallet);

router.get("/my-transactions", getMyTransactions);

router.get("/my-transactions/:year", getMyTransactionsYear);

router.delete("/:userid", deleteTransactionsByUser);

router.get("/analytics/statement", downloadAnalyticsStatement);

router.post("/activity",  getMyActivity);

router.get("/analytics/:type", getMyAnalytics);


export default router;
