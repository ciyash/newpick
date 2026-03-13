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

  const path =
  `/resources/accessTokens?userId=${mobile}&levelName=${process.env.SUMSUB_LEVEL}`;

  const headers = createSumsubHeaders("POST", path, "");

  const data = await sumsubPost(
    process.env.SUMSUB_BASE_URL + path,
    headers
  );

  console.log("SUMSUB RESPONSE:", data);

  return data.token;

};