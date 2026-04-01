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
  // getMyJoinedContests,
  joinContest   // 🔥 correct name
} from "./contest.controller.js";


const router = express.Router();  
// user contest
router.post("/join",  joinContest);

router.get("/my-contests/:match_id",  getMyContests);

// router.get("/joined-contests/:match_id/:contest_id", getMyJoinedContests);  


// admin get contestss

router.get("/", getAllContests);
// router.get("/:match_id", getContestsByMatchId);
router.get("/:match_id",  getContestsByMatchId);
      
export default router;
   

