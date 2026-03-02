import { Router } from "express";
import * as c from "./admin.controller.js";
import * as v from "./admin.validation.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = Router();

//admin
router.post("/createemployee",        adminAuth(["super_admin"]), v.createAdmin,  c.createAdmin);
router.get("/getemployee",            adminAuth(["super_admin"]),                 c.getAdmins);
router.get("/getemployeebyid/:id",    adminAuth(["super_admin"]),                 c.getAdminById);
router.put("/updateemployee/:id",     adminAuth(["super_admin"]), v.updateAdmin,  c.updateAdmin);  
//series
router.post("/createseries",          adminAuth(), v.createSeries,  c.createSeries);
router.get("/getseries",              adminAuth(),                   c.getSeries);
router.get("/getseriesbyid/:id",      adminAuth(),                   c.getSeriesById);
router.put("/updateseries/:id",       adminAuth(), v.updateSeries,  c.updateSeries);

//match
router.post("/creatematches",         adminAuth(), v.createMatch,   c.createMatch);
router.get("/getmatches",             adminAuth(),                   c.getMatches);
router.get("/getmatchesbyid/:id",     adminAuth(),                   c.getMatchById);
router.get("/getmatchesbyseriesid/:id", adminAuth(),                 c.getMatchBySeries);  
router.put("/updatematches/:id",      adminAuth(), v.updateMatch,   c.updateMatch);

//team
router.post("/createteams",           adminAuth(), v.createTeam,    c.createTeam);
router.get("/getteams",               adminAuth(),                   c.getTeams);
router.get("/getteamsbyid/:id",       adminAuth(),                   c.getTeamById);
router.put("/updateteams/:id",        adminAuth(), v.updateTeam,    c.updateTeam);

//player
router.post("/createplayers",         adminAuth(), v.createPlayer,  c.createPlayer);
router.get("/getplayers",             adminAuth(),                   c.getPlayers);
router.get("/getplayersbyid/:id",     adminAuth(),                   c.getPlayerById);
router.get("/getplayersbyteam/:id",   adminAuth(),                   c.getPlayerByTeam);
router.put("/updateplayers/:id",      adminAuth(), v.updatePlayer,  c.updatePlayer);

//contest
router.post("/createcontest",         adminAuth(), v.createContest, c.createContest);
router.get("/getcontests",            adminAuth(),                   c.getContests);
router.get("/getcontestbyid/:id",     adminAuth(),                   c.getContestById);
router.put("/updatecontest/:id",      adminAuth(), v.updateContest, c.updateContest);
router.get("/getcontestbymatch/:matchId",   adminAuth(),             c.getContestsByMatch);
router.get("/getcontestbyseries/:seriesId", adminAuth(),             c.getContestsBySeries);
router.get("/getcontestbyteam/:teamId",     adminAuth(),             c.getContestsByTeam);

//contest category
router.post("/createcontestcategory", adminAuth(), v.createContestCategory, c.createContestCategory);
router.get("/getcontestcategory",     adminAuth(),  c.getContestCategories);

//dashboard
router.get("/getdashboard",           adminAuth(), c.getHome);

//deposites
router.get("/getalldeposits",         adminAuth(), c.getallDeposites);
router.post("/fetchdeposits",         adminAuth(), c.fetchDeposites);
router.get("/fetchdepositssummary",   adminAuth(), c.fetchDepositesSummary);

//withdraws
router.get("/getallwithdraws",        adminAuth(), c.getallWithdraws);
router.post("/fetchwithdraws",        adminAuth(), c.fetchWithdraws);
router.get("/fetchwithdraws summary", adminAuth(), c.fetchWithdrawsSummary);

//users
router.get("/getallusers",            adminAuth(), c.getallUsers);
router.post("/fetchusers",            adminAuth(), c.fetchUsers);
router.post("/fetchusersbykyc",       adminAuth(), c.fetchUsersByKycStatus);
router.post("/fetchusersbyaccount",   adminAuth(), c.fetchUsersByAccountStatus);

export default router;