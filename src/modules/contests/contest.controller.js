import {
  getContestsService,
  joinContestService,
  getAllContestsService

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


export const getContestsByMatchId = async (req, res) => {
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
    const userId = req.user.id;
    const { contestId, userTeamId } = req.body;

    const response = await joinContestService(
      userId,
      contestId,
      userTeamId
    );

    res.status(200).json(response);
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};


