import {
  buySubscriptionService,
  getSubscriptionStatusService
} from "./subscription.service.js";

/**
 * BUY SUBSCRIPTION
 * POST /api/user/subscription/buy
 */
export const buySubscription = async (req, res) => {
  try {
    const userId = req.user.id;     // 🔐 from JWT
    const { pack } = req.body;      // "1M" | "3M"

    if (!pack) {
      return res.status(400).json({
        success: false,
        message: "Subscription pack is required"
      });
    }

    const result = await buySubscriptionService(userId, pack);

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};

/**
 * GET SUBSCRIPTION STATUS
 * GET /api/user/subscription/status
 */
export const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await getSubscriptionStatusService(userId);

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message
    });
  }
};
