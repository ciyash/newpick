import express from "express";
import { getUserProfile } from "./user.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import walletRoutes from "../wallet/wallet.routes.js";
import subscriptionRoutes from "./subscription.routes.js";

const app = express.Router();

app.use("/userprofile", authenticate,getUserProfile);
app.use("/wallet", authenticate,walletRoutes)
app.use("/subscription", authenticate,subscriptionRoutes )

export default app;
