/**
 * PICK2WIN – Scoring Controller
 */

import {
  scoreContestService,
} from "./scoring.service.js";


// ─────────────────────────────────────────────
// POST /api/scoring/contest/:contestId/score
// Trigger scoring for a contest after match ends
// ─────────────────────────────────────────────
export const scoreContest = async (req, res) => {
  try {
    const { contestId } = req.params;
    const { matchId }   = req.body;

    if (!contestId || !matchId) {
      return res.status(400).json({
        success: false,
        message: "contestId (param) and matchId (body) are required",
      });
    }

    const result = await scoreContestService(contestId, matchId);

    return res.status(200).json(result);

  } catch (err) {
    console.error("[scoreContest]", err);
    return res.status(err.statusCode || 500).json({
      success: false,
     message: err.message
    });
  }
};
  

