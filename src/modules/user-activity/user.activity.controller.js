import {
  getMyActivityService,
  requestFullHistoryService,
  approveFullHistoryService,
  checkFullHistoryApproval,
} from "./user.activity.service.js";

// ── Get My Activity ──
export const getMyActivity = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    const { type = null, full_history = "false" } = req.query;

    const validTypes = [
      "wallet", "deposit", "withdrawal", "contest",
      "kyc", "notification", "referral", "login", "profile",
    ];

    if (type && !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid type. Valid: ${validTypes.join(", ")}`,
      });
    }

    const wantsFullHistory = full_history === "true";

    if (wantsFullHistory) {
      const isApproved = await checkFullHistoryApproval(userId);
      if (!isApproved) {
        return res.status(403).json({
          success: false,
          code:    "FULL_HISTORY_NOT_APPROVED",
          message: "Full history access requires admin approval. Please raise a request.",
        });
      }
    }

    const result = await getMyActivityService(userId, {
      type,
      fullHistory: wantsFullHistory,
    });

    return res.status(200).json({ success: true, ...result });

  } catch (err) {
    console.error("getMyActivity error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Request Full History (User) ──
export const requestFullHistory = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    await requestFullHistoryService(userId);

    return res.status(200).json({
      success: true,
      message: "Full history request submitted. Admin will approve shortly.",
    });

  } catch (err) {
    const status = err.code || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};

// ── Approve Full History (Admin) ──
export const approveFullHistory = async (req, res) => {
  try {
    const { requestId, action } = req.body;

    if (!requestId || !action) {
      return res.status(400).json({
        success: false,
        message: "requestId and action are required",
      });
    }

    await approveFullHistoryService(requestId, action);

    return res.status(200).json({
      success: true,
      message: `Request ${action} successfully.`,
    });

  } catch (err) {
    const status = err.code || 500;
    return res.status(status).json({ success: false, message: err.message });
  }
};