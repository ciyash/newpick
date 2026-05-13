// controllers/policy.controller.js

import {
  getPoliciesService,
  acceptPoliciesService,
  getPendingPoliciesService
} from  "./policy.service.js";

// export const getPolicies = async (req, res) => {
//   try {

//     const userId = req.user.id;

//     const data = await getPoliciesService(userId);

//     return res.status(200).json({
//       success: true,
//       data
//     });

//   } catch (error) {

//     console.error("getPolicies controller error:", error);

//     return res.status(500).json({
//       success: false,
//       message: error.message || "Internal server error"
//     });

//   }
// };

export const getPolicies = async (req, res) => {
  try {
    const { screen } = req.query; 
    const data = await getPoliciesService(req.user.id, screen || null);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


export const acceptPolicies = async (req, res) => {
  try {

    const userId = req.user.id;

    const { policyVersionIds } = req.body;

    if (
      !Array.isArray(policyVersionIds) ||
      !policyVersionIds.length
    ) {
      return res.status(400).json({
        success: false,
        message: "policyVersionIds is required"
      });
    }

    const data = await acceptPoliciesService({
      userId,
      policyVersionIds,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      deviceInfo: req.headers["sec-ch-ua-platform"] || null
    });

    return res.status(200).json({
      success: true,
      message: "Policies accepted successfully",
      data
    });

  } catch (error) {

    console.error("acceptPolicies controller error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error"
    });

  }
};





export const getPendingPolicies = async (req, res) => {
  try {

    const userId = req.user.id;

    const data = await getPendingPoliciesService(userId);

    return res.status(200).json({
      success: true,
      data
    });

  } catch (error) {

    console.error("getPendingPolicies controller error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error"
    });

  }
};