import db from "../../config/db.js"

import { createSumsubHeaders,  sumsubPost } from "../../utils/sumsub.js";

import { createApplicantService, generateAddressKycTokenService } from "./kyc.service.js";
 

export const startKyc = async (req, res) => {

  const { mobile, email } = req.body;

  const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

  const applicantId = await createApplicantService(normalizedMobile);

  await db.query(
    `INSERT INTO kyc_sessions (mobile, email, applicant_id, age_verified)
     VALUES (?, ?, ?, 0)
     ON DUPLICATE KEY UPDATE
     applicant_id = VALUES(applicant_id)`,
    [normalizedMobile, email, applicantId]
  );

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

};

export const getKycStatus = async (req, res) => {
  try {

    const { mobile } = req.params;

    const [rows] = await db.query(
      "SELECT age_verified FROM kyc_sessions WHERE mobile=?",
      [mobile]
    );

    if (!rows.length) {
      return res.json({
        success: true,
        ageVerified: 0
      });
    }

    return res.json({
      success: true,
      ageVerified: rows[0].age_verified || 0
    });

  } catch (err) {

    console.error("KYC status error:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });

  }
};


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


/* =============================
   START ADDRESS VERIFICATION
============================= */





export const startAddressVerification = async (req, res) => {

  try {

    const userId = req.user.id;

    const [rows] = await db.query(
      "SELECT mobile FROM users WHERE id=?",
      [userId]
    );

    const mobile = rows[0].mobile;

    const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

    const token = await generateAddressKycTokenService(normalizedMobile);

    res.json({
      success: true,
      token
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: error.message
    });

  }

};