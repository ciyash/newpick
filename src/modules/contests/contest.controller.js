import { getContestsService, joinContestService,  getAllContestsService,  getMyContestsService,  getMyJoinedContestsService
} from "./contest.service.js";

export const getAllContests = async (req, res) => {
  try {
    const contests = await getAllContestsService();

    res.status(200).json({
      success: true,
      total: contests.length,
      data: contests
    });

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

//===============================//===================================//

// export const getContestsByMatchId = async (req, res) => {
//   try {
//     const userId = req.user?.id;
//     const match_id = req.params.match_id?.trim();

//     if (!userId) {
//       return res.status(401).json({
//         success: false,
//         message: "Unauthorized"
//       });
//     }

//     if (!match_id) {
//       return res.status(400).json({
//         success: false,
//         message: "match_id param is required"
//       });
//     }

//     const contests = await getContestsService(match_id, userId);
//     if (!contests || contests.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "No contests found for this match"
//       });
//     }

//     // ✅ currentEntries 0 అయితే only message
//     if (contests.every(c => c.currentEntries === 0)) {
//       return res.status(200).json({
//         success: true,
//         message: "No spots available"
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       total: contests.length,
//       data: contests
//     });

//   } catch (err) {
//     console.error("[getContestsByMatchId]", err);

//     return res.status(err.statusCode || 500).json({
//       success: false,
//       message: err.statusCode ? err.message : "Internal server error"
//     });
//   }
// };

// export const getContestsByMatchId = async (req, res) => {
//   try {
//     const userId = req.user?.id;
//     const match_id = req.params.match_id?.trim();

//     if (!userId) {
//       return res.status(401).json({ success: false, message: "Unauthorized" });
//     }

//     if (!match_id) {
//       return res.status(400).json({ success: false, message: "match_id param is required" });
//     }

//     const contests = await getContestsService(match_id, userId);

//     if (!contests || contests.length === 0) {
//       return res.status(404).json({ success: false, message: "No contests found for this match" });
//     }

//     // ✅ CORRECT: remainingSpots తో check చేయాలి
//     if (contests.every(c => c.remainingSpots === 0)) {
//       return res.status(200).json({
//         success: true,
//         message: "No spots available"
//       });
//     }

//     return res.status(200).json({
//       success: true,
//       total: contests.length,
//       data: contests
//     });

//   } catch (err) {
//     console.error("[getContestsByMatchId]", err);
//     return res.status(err.statusCode || 500).json({
//       success: false,
//       message: err.statusCode ? err.message : "Internal server error"
//     });
//   }
// };


export const getContestsByMatchId = async (req, res) => {
  try {
    const userId = req.user?.id;
    const contest_id = req.params.contest_id?.trim();

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (!contest_id) {
      return res.status(400).json({ success: false, message: "contest_id param is required" });
    }

    const contest = await getContestsService(contest_id, userId);

    if (!contest) {
      return res.status(404).json({ success: false, message: "Contest not found" });
    }

    return res.status(200).json({
      success: true,
      data: contest,
    });

  } catch (err) {
    console.error("[getContestById]", err);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Internal server error",
    });
  }
};
//===============================//===================================//
export const joinContest = async (req, res) => {
  try {
    const userId = req.user.id;

    const { contestId, userTeamId, entryFee } = req.body;

    const response = await joinContestService(
      userId,
      entryFee,   
      {
        contestId,
        userTeamId,
        ip: req.ip,
        device: req.headers["user-agent"]
      }
    );

    res.status(200).json(response);

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};


export const getMyContests = async (req, res) => {
  try {
    const userId = req.user?.id;
    const match_id = req.params.match_id?.trim();

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    if (!match_id) {
      return res.status(400).json({
        success: false,
        message: "match_id param is required"
      });
    }

    const contests = await getMyContestsService(userId, match_id);

    
    if (!contests || contests.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No contests found"
      });
    }

    return res.status(200).json({
      success: true,
      total: contests.length,
      data: contests
    });

  } catch (err) {
    console.error("[getMyContests]", err);

    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Internal server error"
    });
  }
};  

export const getMyJoinedContests = async (req, res) => {
  try {
    const userId = req.user?.id;
    const match_id = req.params.match_id?.trim();
    const contest_id = req.params.contest_id?.trim() || null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    if (!match_id) {
      return res.status(400).json({
        success: false,
        message: "match_id param is required"
      });
    }

    const contests = await getMyJoinedContestsService(userId, match_id, contest_id);
    if (!contests || contests.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No contests found"
      });
    }

    return res.status(200).json({
      success: true,
      total: contests.length,
      data: contests
    });   

  } catch (err) {
    console.error("[getMyJoinedContests]", err);

    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.statusCode ? err.message : "Internal server error"
    });
  }
};