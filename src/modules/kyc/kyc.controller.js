import redis from "../../config/redis.js";
import { createSumsubHeaders,  sumsubPost } from "../../utils/sumsub.js";

import { createApplicantService } from "./kyc.service.js";
 

// export const getKycSdkToken = async (req, res) => {
//   try {
//     const userId = req.user.id;

//     // 🪪 ensure applicant exists
//     const applicantId = await createApplicantService(userId);
//     console.log("Applicant ID:", applicantId);

//     const path =
//       `/resources/accessTokens?userId=${userId}&levelName=${process.env.SUMSUB_LEVEL}`;

//     const headers = createSumsubHeaders("POST", path, "");

//     const data = await sumsubPost(
//       process.env.SUMSUB_BASE_URL + path,
//       headers
//     );

//     console.log("SUMSUB RESPONSE:", data);

//     res.json({
//       success: true,
//       token: data.token || null
//     });

//   } catch (err) {
//     console.error(err);

//     res.status(500).json({
//       success: false,
//       message: err.message
//     });
//   }
// };


export const getKycSdkToken = async (req, res) => {
  try {

    // ⭐ For signup flow use mobile or tempId
    const { mobile } = req.query;

    const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

    const signupRaw = await redis.get(`SIGNUP:${normalizedMobile}`);
    if (!signupRaw) throw new Error("Signup session expired");

    // Use mobile as externalUserId
    const applicantId = await createApplicantService(normalizedMobile);

    const path =
      `/resources/accessTokens?userId=${normalizedMobile}&levelName=${process.env.SUMSUB_LEVEL}`;

    const headers = createSumsubHeaders("POST", path, "");

    const data = await sumsubPost(
      process.env.SUMSUB_BASE_URL + path,
      headers
    );

    res.json({
      success: true,
      token: data.token
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};
