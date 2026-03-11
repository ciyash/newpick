import db from "../../config/db.js"
import { createSumsubHeaders,  sumsubPost } from "../../utils/sumsub.js";

import { createApplicantService } from "./kyc.service.js";
 
export const getKycSdkToken = async (req, res) => {
  try {

    const { mobile, email } = req.body;

    if (!mobile || !email) {
      return res.status(400).json({
        success: false,
        message: "Mobile and email are required"
      });
    }

    const normalizedMobile = String(mobile).replace(/\D/g, "").trim();
    const normalizedEmail  = String(email).toLowerCase().trim();

    /* ================= CHECK IF USER ALREADY EXISTS ================= */

    const [
      [[emailUser]],
      [[mobileUser]]
    ] = await Promise.all([
      db.query(`SELECT id FROM users WHERE email = ?`, [normalizedEmail]),
      db.query(`SELECT id FROM users WHERE mobile = ?`, [normalizedMobile])
    ]);

    if (emailUser) {
      return res.status(400).json({
        success: false,
        message: "Email already registered"
      });
    }

    if (mobileUser) {
      return res.status(400).json({
        success: false,
        message: "Mobile already registered"
      });
    }

    /* ================= CREATE SUMSUB APPLICANT ================= */

    const applicantId = await createApplicantService(normalizedMobile);

    /* ================= GENERATE SDK TOKEN ================= */

    const path = `/resources/accessTokens?userId=${normalizedMobile}&levelName=${process.env.SUMSUB_LEVEL}`;

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

// export const getKycSdkToken = async (req, res) => {
//   try {

//     // ⭐ For signup flow use mobile or tempId
//     const { mobile } = req.query;

//     const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

//     const signupRaw = await redis.get(`SIGNUP:${normalizedMobile}`);
//     if (!signupRaw) throw new Error("Signup session expired");

//     // Use mobile as externalUserId
//     const applicantId = await createApplicantService(normalizedMobile);

//     const path =
//       `/resources/accessTokens?userId=${normalizedMobile}&levelName=${process.env.SUMSUB_LEVEL}`;

//     const headers = createSumsubHeaders("POST", path, "");

//     const data = await sumsubPost(
//       process.env.SUMSUB_BASE_URL + path,
//       headers
//     );

//     res.json({
//       success: true,
//       token: data.token
//     });

//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: err.message
//     });
//   }
// };



export const kycComplete = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: "Mobile required"
      });
    }

    await db.query(
      `UPDATE users SET age_verified = 1 WHERE mobile = ?`,
      [mobile]
    );

    res.json({
      success: true,
      message: "KYC marked as completed"
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};