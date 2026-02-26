import { createSumsubHeaders,  sumsubPost } from "../../utils/sumsub.js";

import { createApplicantService } from "./kyc.service.js";

export const getKycSdkToken = async (req, res) => {
  try {
    const userId = req.user.id;

    // 🪪 STEP 1 — ensure applicant exists
    await createApplicantService(userId);

    // 🎥 STEP 2 — get SDK token
    const path =
      `/resources/accessTokens?userId=${userId}&levelName=${process.env.SUMSUB_LEVEL}`;

    const headers = createSumsubHeaders("POST", path, "");

    const data = await sumsubPost(
      process.env.SUMSUB_BASE_URL + path,
      headers
    );

    console.log("SUMSUB RESPONSE:", data);

    res.json({
      success: true,
      token: data.token
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};