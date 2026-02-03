import { getUserProfileService } from "./user.service.js";

export const getProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await getUserProfileService(userId);

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};
