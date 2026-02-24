import express from "express";

import { getAllMatches, getMatchFullDetails } from "./match.controller.js";

import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/all", authenticate, checkAccountActive, getAllMatches);

router.get("/:id", authenticate, checkAccountActive, getMatchFullDetails);

export default router  
 //