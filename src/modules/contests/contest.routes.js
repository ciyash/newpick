// import express from "express";
// import { getContestsService } from "./contest.service.js";
// import { authenticate, checkAccountActive } from "../../middlewares/auth.middleware.js";
// import {deductForContest} from './contest.controller.js'

// const router = express.Router();

// router.post("/deduct-for-contest", authenticate, checkAccountActive, deductForContest);

// router.post("/get-contests", getContestsService)



// export default router;




import express from "express";
import {
  getContests,
  joinContest   // 🔥 correct name
} from "./contest.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", authenticate, getContests);
router.post("/join", authenticate, joinContest);

export default router;


