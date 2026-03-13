import { createSumsubHeaders, sumsubPost } from "../../utils/sumsub.js";

export const createApplicantService = async (mobile) => {

  const path = "/resources/applicants?levelName=" + process.env.SUMSUB_LEVEL;

  const body = JSON.stringify({
    externalUserId: String(mobile),
    info: { country: "IND" }
  });

  const headers = createSumsubHeaders("POST", path, body);

  const applicant = await sumsubPost(
    process.env.SUMSUB_BASE_URL + path,
    headers,
    body
  );

  return applicant.id;

};


/* =============================
   GENERATE ADDRESS KYC TOKEN
============================= */

export const generateAddressKycTokenService = async (mobile) => {

  try {

    const path =
      `/resources/accessTokens?userId=${mobile}&levelName=address-verification`;

    const headers = createSumsubHeaders("POST", path, "");

    const data = await sumsubPost(
      process.env.SUMSUB_BASE_URL + path,
      headers
    );

    return data.token;

  } catch (error) {

    console.error("Address KYC service error:", error);

    throw error;

  }

};