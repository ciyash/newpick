
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


// export const sumsubWebhook = async (req, res) => {
//   try {

//     const { applicantId, reviewResult } = req.body;

//     if (!applicantId) {
//       return res.status(400).send("Applicant ID missing");
//     }

//     let status = "pending";
//     let ageVerified = 0;

//     const answer = reviewResult?.reviewAnswer;

//     if (answer === "GREEN") {
//       status = "approved";
//       ageVerified = 1;
//     }
//     else if (answer === "RED") {
//       status = "rejected";
//     }

//     const [result] = await db.query(
//       `UPDATE users
//        SET kyc_status = ?, age_verified = ?
//        WHERE sumsub_applicant_id = ?`,
//       [status, ageVerified, applicantId]
//     );

//     if (result.affectedRows === 0) {
//       console.log("User not found for applicant:", applicantId);
//     }

//     console.log("KYC updated:", applicantId, status);

//     return res.sendStatus(200);

//   } catch (err) {

//     console.error("KYC webhook error:", err);
//     return res.sendStatus(500);

//   }  
// };

export const sumsubWebhook = async (req, res) => {

  try {

    const { applicantId, reviewResult } = req.body;

    const status = reviewResult?.reviewAnswer;

    const ageVerified = status === "GREEN" ? 1 : 0;

    await db.query(
      `UPDATE users 
       SET age_verified = ?
       WHERE sumsub_applicant_id = ?`,
      [ageVerified, applicantId]
    );

    res.sendStatus(200);

  } catch (err) {

    res.sendStatus(500);

  }

};


export const getKycStatus = async (req, res) => {
  try {

    const { mobile } = req.params;

    if (!mobile) {
      return res.status(400).json({
        success: false,
        message: "Mobile number required"
      });
    }

    const normalizedMobile = String(mobile).replace(/\D/g, "").trim();

    const [[user]] = await db.query(
      `SELECT age_verified
       FROM users
       WHERE mobile = ?`,
      [normalizedMobile]
    );

    if (!user) {
      return res.json({
        success: true,
        ageVerified: 0
      });
    }

    res.json({
      success: true,
      ageVerified: user.age_verified
    });

  } catch (err) {

    res.status(500).json({
      success: false,
      message: err.message
    });

  }
};