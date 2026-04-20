import { addGenerateTeamJob } from "../queue/queueAdapter.js";

export const generateTeamController = async (req, res) => {
  try {
    const data = req.body;

    const result = await addGenerateTeamJob(data);

    return res.json({
      success: true,
      message: result?.queued
        ? "Team generation queued"
        : "Teams generated successfully"
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};