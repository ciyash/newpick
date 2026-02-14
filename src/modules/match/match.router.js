import express from "express";
import { getAllMatches, getMatchesBySeriesId } from "./match.controller.js";
import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";

const router = express.Router();



router.get("/all", authenticate, checkAccountActive, getAllMatches);

router.get("/:seriesid", authenticate, checkAccountActive, getMatchesBySeriesId);

export default router