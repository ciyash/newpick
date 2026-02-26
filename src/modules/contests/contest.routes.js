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
  getAllContests,
  getContestsByMatchId,
  getMyContests,
  joinContest   // 🔥 correct name
} from "./contest.controller.js";


const router = express.Router();
// user contest
router.post("/join",  joinContest);
router.get("/my-contests",  getMyContests);

// admin get contest

router.get("/", getAllContests);
router.get("/:match_id", getContestsByMatchId);



export default router;


