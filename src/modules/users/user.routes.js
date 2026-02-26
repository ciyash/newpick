import express from "express";
import {
  getUserProfile, reduceMonthlyLimit, createFeedback, getMyFeedbacks, pauseAccount,
  deleteAccount
} from "./user.controller.js";
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";
import walletRoutes from "../wallet/wallet.routes.js";
import subscriptionRoutes from "./subscription.routes.js";
import contestRoutes from '../contests/contest.routes.js'  
import seriesRoutes from '../series/series.route.js'
import teamRoutes from '../teams/team.routes.js'
import matchesRoutes from '../match/match.router.js'
import { saveFcmToken ,testNotification} from '../../middlewares/send.notification.js';
import paymentRoutes from '../payment/payment.router.js'
import uctRoutes from '../uct/uct.route.js'
import kycRoutes from '../kyc/kyc.route.js'

const app = express.Router();

app.get("/userprofile", authenticate, getUserProfile);
app.use("/wallet", authenticate, checkAccountActive, walletRoutes)
app.use("/subscription", authenticate, checkAccountActive, subscriptionRoutes)
app.use("/reduce-limit", authenticate, checkAccountActive, reduceMonthlyLimit);
app.post("/create-feedback", authenticate, checkAccountActive, createFeedback);
app.get("/get-feedback", authenticate, getMyFeedbacks);
app.post("/pause-account", authenticate, checkAccountActive, pauseAccount);
app.delete("/delete-account", authenticate, checkAccountActive, deleteAccount);
app.use("/contest", authenticate, checkAccountActive, contestRoutes)
app.use("/series", authenticate, checkAccountActive, seriesRoutes)  
app.use("/matches", authenticate, checkAccountActive, matchesRoutes)
app.use("/teams", authenticate, checkAccountActive, teamRoutes)
app.post("/save-fcm-token", authenticate, saveFcmToken);
app.post("/test-notification", authenticate, testNotification);
app.use("/payment",authenticate,checkAccountActive, paymentRoutes)
app.use("/uct",authenticate,checkAccountActive, uctRoutes)
app.use("/kyc",authenticate,checkAccountActive,kycRoutes)

export default app;     