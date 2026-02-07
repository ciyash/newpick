import express from "express";

import { getProfile } from "./user.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import walletRoutes from "../wallet/wallet.routes.js";

const app = express.Router();

app.get("/userprofile", authenticate, getProfile);
app.use("/wallet", authenticate,walletRoutes)

export default app;
