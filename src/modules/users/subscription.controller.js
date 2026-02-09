import {
  buySubscriptionService,
  getSubscriptionStatusService
} from "./subscription.service.js";

export const buySubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const { pack } = req.body;

    const result = await buySubscriptionService(userId, pack, {
      ip: req.ip,
      device: req.headers["user-agent"]
    });

    res.status(200).json({
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
