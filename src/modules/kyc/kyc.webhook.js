import db from "../../config/db.js";

// export const sumsubWebhook = async (req, res) => {

//   const { externalUserId, reviewResult } = req.body;

//   if (reviewResult?.reviewAnswer === "GREEN") {

//     await db.query(
//       "UPDATE kyc_sessions SET age_verified=1 WHERE mobile=?",
//       [externalUserId]
//     );

//   }

//   res.send("ok");
// };


export const sumsubWebhook = async (req, res) => {

 try {

  const { externalUserId, applicantId, reviewResult, levelName } = req.body;

  const reviewAnswer = reviewResult?.reviewAnswer;

  /*
   GREEN → approved
   RED → rejected
  */

  if (reviewAnswer === "GREEN") {

   /* Age verification */

   if (levelName === "age-verification") {

    await db.query(
     "UPDATE kyc_sessions SET age_verified = 1 WHERE mobile = ?",
     [externalUserId]
    );

   }

   /* Address verification */

   if (levelName === "address-verification") {

    await db.query(
     `UPDATE users 
      SET address_verified = 1, kyc_status = 'approved'
      WHERE sumsub_applicant_id = ?`,
     [applicantId]
    );

   }

  }

  if (reviewAnswer === "RED") {

   await db.query(
    `UPDATE users 
     SET kyc_status = 'rejected'
     WHERE sumsub_applicant_id = ?`,
    [applicantId]
   );

  }

  res.sendStatus(200);

 } catch (error) {

  console.error("Sumsub webhook error:", error);

  res.sendStatus(500);

 }

};
