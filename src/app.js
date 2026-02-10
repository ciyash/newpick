// server.js
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import routes from "./routes/index.js"; 


const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/test", (req, res) => {
  console.log("Test route hit!");
  res.json({ success: true, message: "Test route works" });
});

app.use("/api", routes);

export default app;
  