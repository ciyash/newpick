// routes/series.routes.js
import express from "express";

import { getAllSeries, getSeriesById } from "./series.controller.js";
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/:id", authenticate, checkAccountActive, getSeriesById);

router.get("/", authenticate, checkAccountActive, getAllSeries);
  

export default router;
  