import { getUserProfileService } from "./user.service.js";

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
