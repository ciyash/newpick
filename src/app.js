import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import routes from "./routes/index.js";
import { stripeWebhook } from "./modules/payment/webhook.controller.js";

const REQUIRED_ENV = ["JWT_SECRET", "DB_HOST", "DB_USER", "DB_PASSWORD", "STRIPE_PUBLISHABLE_KEY"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(` Missing required env var: ${key} — server cannot start`);
  }
}

const app = express();
app.post(
  "/api/user/payment/webhook/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || ["http://localhost:3000"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(helmet({
  contentSecurityPolicy: true,
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));

app.use(express.json({ limit: "10kb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
if (process.env.NODE_ENV !== "production") {
  app.get("/test", (req, res) => {
    res.json({ success: true, message: "Test route works" });
  });
}


app.use("/api", routes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.path} not found` });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = process.env.NODE_ENV === "production"
    ? "Internal server error"
    : err.message;

  console.error(`[${req.method}] ${req.path} →`, err);
  res.status(status).json({ success: false, message });
});

export default app;