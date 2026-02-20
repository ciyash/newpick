import { getUserProfileService, reduceMonthlyLimitService,  createFeedbackService,
  getMyFeedbacksService } from "./user.service.js";
import { feedbackSchema } from "./user.validation.js";
import db from "../../config/db.js";


export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const profile = await getUserProfileService(userId);

    res.status(200).json({
      success: true,
      data: profile
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};


export const reduceMonthlyLimit = async (req, res) => {
  try {
    const userId = req.user.id;
    const { newLimit } = req.body;

    if (!newLimit || isNaN(newLimit)) {
      throw new Error("Valid limit is required");
    }

    await reduceMonthlyLimitService(
      userId,
      Number(newLimit)
    );

    res.status(200).json({
      success: true,
      message: "Monthly deposit limit reduced successfully"
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};



//feedback controller...........................................................


export const createFeedback = async (req, res) => {
  try {
    const userId = req.user.id; // 🔐 from JWT

    await feedbackSchema.validateAsync(req.body);

    const result = await createFeedbackService(userId, req.body);

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.details?.[0]?.message || err.message
    });
  }
};


export const getMyFeedbacks = async (req, res) => {
  try {
    const userId = req.user.id;

    const feedbacks = await getMyFeedbacksService(userId);

    res.status(200).json(feedbacks);
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};


export const pauseAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const { duration } = req.body;

    const durationMap = {
      "15d": 15,
      "1m": 30,
      "3m": 90,
      "6m": 180
    };

    if (!durationMap[duration]) {
      return res.status(400).json({
        success: false,
        message: "Invalid duration (15d | 1m | 3m | 6m)"
      });
    }

    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + durationMap[duration]);

    await db.query(
      `UPDATE users SET
        account_status = 'paused',
        pause_start = ?,
        pause_end = ?
       WHERE id = ?`,
      [start, end, userId]
    );

    return res.status(200).json({
      success: true,
      message: "Account paused successfully",
      pausedFrom: start,
      pausedTill: end
    });

  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};


export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;

    await db.query(
      `UPDATE users
       SET account_status = 'deleted',
           is_deleted = 1,
           deleted_at = NOW()
       WHERE id = ?`,
      [userId]
    );

    res.status(200).json({
      success: true,
      message: "Account deleted successfully"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};



