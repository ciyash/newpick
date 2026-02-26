import { createSumsubHeaders, sumsubPost } from "../../utils/sumsub.js";

export const createApplicantService = async (userId) => {

  const path = "/resources/applicants";

  const body = JSON.stringify({
    externalUserId: String(userId),
    info: { country: "GB" }
  });

  const headers = {
    ...createSumsubHeaders("POST", path, body),
    "Content-Type": "application/json"   // 🔥 REQUIRED
  };

  const data = await sumsubPost(
    process.env.SUMSUB_BASE_URL + path,
    headers,
    body
  );

  console.log("APPLICANT RESPONSE:", data);

  return data.id;
};