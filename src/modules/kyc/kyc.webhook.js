
// import db from "../../config/db.js";

// export const sumsubWebhook = async (req, res) => {
//   try {

//     const { applicantId, reviewResult } = req.body;

//     if (!applicantId) {
//       return res.status(400).send("Applicant ID missing");
//     }

//     let status = "pending";
//     let ageVerified = 0;

//     if (reviewResult?.reviewAnswer === "GREEN") {
//       status = "approved";
//       ageVerified = 1;
//     } 
//     else if (reviewResult?.reviewAnswer === "RED") {
//       status = "rejected";
//     }

//     await db.query(
//       `UPDATE users 
//        SET kyc_status = ?, 
//            age_verified = ?
//        WHERE sumsub_applicant_id = ?`,
//       [status, ageVerified, applicantId]
//     );

//     console.log("KYC updated:", applicantId, status);

//     res.send("OK");

//   } catch (err) {

//     console.error(err);
//     res.status(500).send("Error");

//   }
// };




import db from "../../config/db.js";

export const sumsubWebhook = async (req, res) => {

  const { externalUserId, reviewResult } = req.body;

  if (reviewResult?.reviewAnswer === "GREEN") {

    await db.query(
      "UPDATE users SET age_verified=1 WHERE mobile=?",
      [externalUserId]
    );

  }

  res.send("ok");
};