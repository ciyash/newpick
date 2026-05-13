// routes/policy.routes.js

import express from "express";


import {
  getPolicies,
  acceptPolicies,
  getPendingPolicies
} from  "./policy.controller.js";

import { validate } from "../../middlewares/validate.js"
import { acceptPoliciesSchema } from "./policy.validation.js";

const router = express.Router();

router.get("/type",   getPolicies);

router.get("/pending", getPendingPolicies);

router.post("/accept", validate(acceptPoliciesSchema), acceptPolicies);





export default router;