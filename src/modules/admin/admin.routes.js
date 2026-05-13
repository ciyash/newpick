import { Router } from "express";
import * as c from "./admin.controller.js";
import * as v from "./admin.validation.js";
import { adminAuth, adminLimiter } from "../../middlewares/adminAuth.middleware.js";
import { buildPrizeDistribution } from "./lib/prize_distributionv2.js";
import { newCreateContestService } from "./admin.service.js";
import sportmonksRoutes from '../sportmonks/sportmonks.router.js'
import testRoutes from '../test/test.routes.js'


const router = Router();
router.use(adminLimiter);
//admin
router.post("/createemployee",        adminAuth(["super_admin"]), v.createAdmin,  c.createAdmin);
router.get("/getemployee",            adminAuth(["super_admin"]),                 c.getAdmins);
router.get("/getemployeebyid/:id",    adminAuth(["super_admin"]),                 c.getAdminById);
router.put("/updateemployee/:id",     adminAuth(["super_admin"]), v.updateAdmin,  c.updateAdmin);
// permissions
router.get("/getpermissions/:id",    adminAuth(["super_admin"]), c.getAdminPermissions);
router.put("/updatepermissions/:id", adminAuth(["super_admin"]), c.updateAdminPermissions);  
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
router.get("/getContestsbyusers",            adminAuth(),                   c.getContestsbyusers);


// Preview prizes — no DB write, pure calculation
router.post("/contest/preview-prizes", adminAuth(), async (req, res) => {
  try {
    const entry_fee        = Number(req.body.entry_fee);
    const platform_fee_pct = Number(req.body.platform_fee_pct);
    const max_entries      = parseInt(req.body.max_entries, 10);
    const winner_percent   = Number(req.body.winner_percent);

    if (!entry_fee || isNaN(entry_fee))
      return res.status(400).json({ success: false, message: "entry_fee is required" });
    if (!max_entries || isNaN(max_entries))
      return res.status(400).json({ success: false, message: "max_entries is required" });
    if (!winner_percent || isNaN(winner_percent))
      return res.status(400).json({ success: false, message: "winner_percent is required" });
    if (isNaN(platform_fee_pct))
      return res.status(400).json({ success: false, message: "platform_fee_pct is required" });

    const distribution = buildPrizeDistribution({
      maxEntries:         max_entries,
      entryFee:           entry_fee,
      platformFeePercent: platform_fee_pct,
      winnerPercent:      winner_percent,
    });

    return res.status(200).json({
      success:            true,
      summary:            distribution.summary,
      zones:              distribution.zones,
      prize_distribution: distribution.prize_distribution,
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
});

// New create contest — saves to DB using new prize model
router.post("/contest/new", adminAuth(), async (req, res) => {
  try {
    const result = await newCreateContestService(
      {
        match_id:       req.body.match_id,
        contest_type:   req.body.contest_type,
        max_entries:    parseInt(req.body.max_entries, 10),
        winner_percent: Number(req.body.winner_percent),
        status:         req.body.status,
      },
      req.admin,
      req.ip
    );
    return res.status(201).json(result);
  } catch (err) {
    const known = ["not found","must be","already exists","Invalid","UPCOMING","entry fee","validation"];
    const isKnown = known.some(e => err.message?.includes(e));
    return res.status(isKnown ? 400 : 500).json({ success: false, message: err.message });
  }
});

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
router.post("/withdraw/:withdrawId/approve", adminAuth(), v.approveWithdraw, c.approveWithdrawal);
router.post("/withdraw/:withdrawId/reject",  adminAuth(), v.rejectWithdraw,  c.rejectWithdrawal);
router.get("/withdraw/list",                 adminAuth(),                     c.getAllWithdrawals);
router.get("/withdraw/:withdrawId",          adminAuth(),                     c.getWithdrawalDetail);
router.get("/getFinancialSummary",        adminAuth(), c.getFinancialSummary);

//users
router.get("/getallusers",            adminAuth(), c.getallUsers);
router.post("/fetchusers",            adminAuth(), c.fetchUsers);
router.post("/fetchusersbykyc",       adminAuth(), c.fetchUsersByKycStatus);
router.post("/fetchusersbyaccount",   adminAuth(), c.fetchUsersByAccountStatus);
router.get("/getUsersByType",            adminAuth(), c.getUsersByType);
router.get("/getUserDetails",            adminAuth(), c.getUserDetails);
router.get("/getuserbyid/:id",           adminAuth(), c.getUserById);


//Expenditure
router.post("/addExpenditure",         adminAuth(),              c.addExpenditure);
router.get("/getExpenditure",             adminAuth(),   c.getExpenditure);
router.get("/getExpenditureSummary",             adminAuth(),   c.getExpenditureSummary);
router.get("/getFYExpenditure",             adminAuth(),   c.getFYExpenditure);

//Chandu works

//entity-sport  


//sportmonks
router.use("/sportmonks", adminAuth(), sportmonksRoutes);

router.use("/test",testRoutes);
//=================================================================================
router.get("/match-live/:match_id",   c.setMatchLive);

// Match RESULT process చేయి (ranks + winnings + wallet credit)
router.get("/match-result/:match_id", c.processMatchResult);


// ── Policy category routes ────────────────────────────────────────────────
router.get('/policies/categories',             adminAuth(), c.getPolicyCategories);
router.post('/policies/categories',            adminAuth(), c.createPolicyCategory);
router.put('/policies/categories/:id',         adminAuth(), c.updatePolicyCategory);

// ── Policy version routes ─────────────────────────────────────────────────
router.post('/policies/:categoryId/versions',            adminAuth(), c.publishPolicyVersion);
router.put('/policies/versions/:versionId',             adminAuth(), c.updatePolicyVersion);
router.get('/policies/versions/:versionId/report',       adminAuth(), c.getPolicyAcceptanceReport);

export default router;
