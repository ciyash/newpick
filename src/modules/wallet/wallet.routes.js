import express from "express";
import { addMoney, getMyWallet, getMyTransactions, deleteTransactionsByUser, getMyAnalytics, downloadAnalyticsStatement, getMyTransactionsYear } from "./wallet.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";


const router = express.Router();

router.post("/add-money", authenticate, addMoney);

router.get("/my-wallet", getMyWallet);

router.get("/my-transactions", getMyTransactions);

router.get("/my-transactions/:year", getMyTransactionsYear);

router.delete("/:userid", deleteTransactionsByUser);

router.get("/analytics/:type", getMyAnalytics);

router.get("/analytics/statement", downloadAnalyticsStatement);

export default router;
