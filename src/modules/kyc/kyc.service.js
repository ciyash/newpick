import { createSumsubHeaders, sumsubPost } from "../../utils/sumsub.js";

// export const createApplicantService = async (userId) => {

//   const path = "/resources/applicants";

//   const body = JSON.stringify({
//     externalUserId: String(userId),
//     info: { country: "GB" }
//   });

//   const headers = {
//     ...createSumsubHeaders("POST", path, body),
//     "Content-Type": "application/json"   // 🔥 REQUIRED
//   };

//   const data = await sumsubPost(
//     process.env.SUMSUB_BASE_URL + path,
//     headers,
//     body
//   );

//   console.log("APPLICANT RESPONSE:", data);

//   return data.id;
// };

export const createApplicantService = async (userId) => {

  const path = "/resources/applicants?levelName=" + process.env.SUMSUB_LEVEL;

  const body = JSON.stringify({
    externalUserId: String(userId),
    info: { country: "GB" }
  });

  const headers = createSumsubHeaders("POST", path, body);

  const applicant = await sumsubPost(
    process.env.SUMSUB_BASE_URL + path,
    headers,
    body
  );

  const applicantId = applicant.id;

  // ⭐ SAVE IN DB
  await db.query(
    "UPDATE users SET sumsub_applicant_id=? WHERE id=?",
    [applicantId, userId]
  );

  return applicantId;
};
