import {
  getContestsService,
  deductForContestService
} from "./contest.service.js";

export const getContests = async (req, res) => {
  try {
    const { match_id } = req.query;

    const contests = await getContestsService(match_id);

    res.status(200).json({
      success: true,
      total: contests.length,
      data: contests
    });

  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

export const joinContest = async (req, res) => {
  try {
    const userId = req.user.id; // 🔒 from token only
    const { entryFee } = req.body;

    if (!entryFee || isNaN(entryFee) || Number(entryFee) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid entry fee"
      });
    }

    const result = await deductForContestService(userId, Number(entryFee));

    if (!result.allowed) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
        eligibleTeams: result.eligibleTeams,
        action: "ADD_MONEY_OR_REDUCE_TEAMS"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Contest joined successfully",
      walletUsed: {
        bonus: result.used.bonusUsed,
        deposit: result.used.depositUsed,
        withdraw: result.used.withdrawUsed
      }
    });

  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
};