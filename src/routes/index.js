
import express from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import userRoutes from "../modules/users/user.routes.js";

const app = express()

app.use("/auth", authRoutes);
app.use("/user", userRoutes);

export default app;
