import express from "express";
import { getUserProfile,reduceMonthlyLimit,createFeedback,getMyFeedbacks ,  pauseAccount,
  resumeAccount,deleteAccount} from "./user.controller.js";
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";
import walletRoutes from "../wallet/wallet.routes.js";
import subscriptionRoutes from "./subscription.routes.js";


const app = express.Router();

app.get("/userprofile", authenticate,getUserProfile);
app.use("/wallet", authenticate,checkAccountActive,walletRoutes)
app.use("/subscription", authenticate,checkAccountActive,subscriptionRoutes )
app.use("/reduce-limit", authenticate,checkAccountActive,reduceMonthlyLimit);
app.post("/create-feedback", authenticate,checkAccountActive, createFeedback);
app.get("/get-feedback", authenticate, getMyFeedbacks);
app.post("/pause-account", authenticate,checkAccountActive, pauseAccount);
app.post("/resume-account", authenticate,resumeAccount);
app.delete("/delete-account", authenticate,checkAccountActive, deleteAccount);



export default app;