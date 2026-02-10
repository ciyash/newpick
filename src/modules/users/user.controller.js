import { getUserProfileService, reduceMonthlyLimitService,  createFeedbackService,
  getMyFeedbacksService } from "./user.service.js";
import { feedbackSchema } from "./user.validation.js";

export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id; // ✅ from JWT

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



