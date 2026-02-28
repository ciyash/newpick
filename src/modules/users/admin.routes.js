import { Router } from "express";
import * as c from "./admin.controller.js";
import * as v from "./admin.validation.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = Router();

/* ADMIN */
router.post("/createemployee", adminAuth(["super_admin"]), v.createAdmin, c.createAdmin);
router.get("/getemployee", adminAuth(["super_admin"]), c.getAdmins);
router.get("/getemployeebyid/:id", adminAuth(["super_admin"]), c.getAdminById);
router.put("/updateeemployee/:id", adminAuth(["super_admin"]), v.updateAdmin, c.updateAdmin);

/* SERIES */
router.post("/createseries", adminAuth(), v.createSeries, c.createSeries);
router.get("/getseries", adminAuth(), c.getSeries);
router.get("/getseriesbyid/:id", adminAuth(), c.getSeriesById);
router.put("/updateseries/:id", adminAuth(), v.updateSeries, c.updateSeries);

/* MATCH */
router.post("/creatematches", adminAuth(), v.createMatch, c.createMatch);
router.get("/getmatches", adminAuth(), c.getMatches);
router.get("/getmatchesbyid/:id", adminAuth(), c.getMatchById);
router.get("/getmatchesbyseriesid/:id", adminAuth(), c.getMatchById);
router.put("/updatematches/:id", adminAuth(), v.updateMatch, c.updateMatch);

/* TEAM */
router.post("/createteams", adminAuth(), v.createTeam, c.createTeam);
router.get("/getteams", adminAuth(), c.getTeams);
router.get("/getteamsbyid/:id", adminAuth(), c.getTeamById);
router.put("/updateteams/:id", adminAuth(), v.updateTeam, c.updateTeam);

/* PLAYER */
router.post("/createplayers", adminAuth(), v.createPlayer, c.createPlayer);
router.get("/getplayers", adminAuth(), c.getPlayers);
router.get("/getplayersbyid/:id", adminAuth(), c.getPlayerById);
router.get("/getplayersbyteam/:id", adminAuth(), c.getPlayerByTeam);
router.put("/updateplayers/:id", adminAuth(), v.updatePlayer, c.updatePlayer);

/* CONTEST */
router.post("/createcontest",adminAuth(),v.createContest,c.createContest);
router.get("/getcontests",adminAuth(),c.getContests);
router.get("/getcontestbyid/:id",adminAuth(),c.getContestById);
router.put("/updatecontest/:id",adminAuth(),v.updateContest,c.updateContest);
router.get("/getcontestbymatch/:matchId",adminAuth(),c.getContestsByMatch);
router.get("/getcontestbyseries/:seriesId",adminAuth(),c.getContestsBySeries);
router.get("/getcontestbyteam/:teamId",adminAuth(),c.getContestsByTeam);


/* CONTEST CATEGORY */
router.post("/createContestCategory",adminAuth(),v.createContestCategory,c.createContestCategory);
router.get("/getContestcategory",adminAuth(),c.getContestcategory);

/* Home */
router.get("/getDashboard",adminAuth(),c.getHome);


/* Deposites */
router.get("/getallDeposites",adminAuth(),c.getallDeposites);
router.post("/fetchDeposites",adminAuth(),c.fetchDeposites);
router.get("/fetchDepositesSummary",adminAuth(),c.fetchDepositesSummary);

/* Withdraws */
router.get("/getallWithdraws",adminAuth(),c.getallWithdraws);
router.post("/fetchWithdraws",adminAuth(),c.fetchWithdraws);
router.get("/fetchWithdrawsSummary",adminAuth(),c.fetchWithdrawsSummary);

/* Users */
router.get("/getallUsers",adminAuth(),c.getallUsers);
router.post("/fetchUsers",adminAuth(),c.fetchUsers);
router.post("/fetchUsersByKycStatus",adminAuth(),c.fetchUsersByKycStatus);
router.post("/fetchUsersByAccountStatus",adminAuth(),c.fetchUsersByAccountStatus);



export default router;
