import express from "express";
import { getUserProfile,reduceMonthlyLimit,createFeedback,getMyFeedbacks } from "./user.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import walletRoutes from "../wallet/wallet.routes.js";
import subscriptionRoutes from "./subscription.routes.js";


const app = express.Router();

app.use("/userprofile", authenticate,getUserProfile);
app.use("/wallet", authenticate,walletRoutes)
app.use("/subscription", authenticate,subscriptionRoutes )
app.use("/reduce-limit", authenticate,reduceMonthlyLimit);
app.use("/create-feedback", authenticate, createFeedback);
app.use("/get-feedback", authenticate, getMyFeedbacks);

export default app;