
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
import redis from "../../config/redis.js";


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


export const sumsubWebhook = async (req,res)=>{

 const { externalUserId, reviewResult } = req.body;

 const mobile = externalUserId;

 if(reviewResult?.reviewAnswer === "GREEN"){

   const session = await redis.get(`KYC:${mobile}`);

   if(session){

     const data = JSON.parse(session);

     data.age_verified = 1;

     await redis.set(
       `KYC:${mobile}`,
       JSON.stringify(data),
       { EX: 900 }
     );

   }

 }

 res.sendStatus(200);

};


export const getKycStatus = async (req,res)=>{

 const { mobile } = req.params;

 const session = await redis.get(`KYC:${mobile}`);

 if(!session){

   return res.json({
     success:true,
     ageVerified:0
   });

 }

 const data = JSON.parse(session);

 res.json({
   success:true,
   ageVerified:data.age_verified
 });

};