import { createSumsubHeaders, sumsubPost } from "../../utils/sumsub.js";
import db from "../../config/db.js";


// export const createApplicantService = async (userId) => {

//   const path = "/resources/applicants?levelName=" + process.env.SUMSUB_LEVEL;

//   const body = JSON.stringify({
//     externalUserId: String(userId),  
//     info: { country: "GB" }
//   });

//   const headers = createSumsubHeaders("POST", path, body);

//   const applicant = await sumsubPost(
//     process.env.SUMSUB_BASE_URL + path,
//     headers,
//     body
//   );

//   const applicantId = applicant.id;

//   // ⭐ SAVE IN DB
//   await db.query(
//     "UPDATE users SET sumsub_applicant_id=? WHERE id=?",
//     [applicantId, userId]
//   );

//   return applicantId;
// };


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


//address....................


const createSignature = (method, url, body = "") => {

 const ts = Math.floor(Date.now() / 1000).toString();

 const signature = crypto
  .createHmac("sha256", process.env.SUMSUB_SECRET_KEY)
  .update(ts + method + url + body)
  .digest("hex");

 return { ts, signature };
};

export const generateKycTokenService = async (userId) => {

 const url = `/resources/accessTokens?userId=${userId}&levelName=${process.env.SUMSUB_LEVEL}`;

 const { ts, signature } = createSignature("POST", url);

 const response = await axios.post(
  `${process.env.SUMSUB_BASE_URL}${url}`,
  {},
  {
   headers: {
    "X-App-Token": process.env.SUMSUB_APP_TOKEN,
    "X-App-Access-Ts": ts,
    "X-App-Access-Sig": signature
   }
  }
 );

 return response.data.token;
};