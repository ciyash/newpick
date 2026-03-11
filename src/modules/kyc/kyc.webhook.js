
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




import redis from "../../config/redis.js";
import db from "../../config/db.js";

export const sumsubWebhook = async (req, res) => {

  try {

    const payload = req.body;

    console.log("📩 Sumsub webhook payload:", payload);

    const externalUserId = payload?.externalUserId;
    const reviewResult = payload?.reviewResult;

    if (!externalUserId) {

      console.log("⚠️ No externalUserId received");

      return res.sendStatus(200);
    }

    const mobile = String(externalUserId).replace(/\D/g, "").trim();

    console.log("📱 Mobile from webhook:", mobile);

    /* Check review result */

    if (reviewResult?.reviewAnswer === "GREEN") {

      console.log("✅ KYC approved for:", mobile);

      /* Get Redis session */

      const session = await redis.get(`KYC_SESSION:${mobile}`);

      if (session) {

        const data =
          typeof session === "string"
            ? JSON.parse(session)
            : session;

        data.age_verified = 1;

        await redis.set(
          `KYC_SESSION:${mobile}`,
          JSON.stringify(data),
          { EX: 600 }
        );

        console.log("🟢 Redis session updated:", data);

      }

      /* Optional: update DB if user already exists */

      await db.query(
        `UPDATE users
         SET age_verified = 1
         WHERE mobile = ?`,
        [mobile]
      );

      console.log("🟢 DB updated if user exists");

    }

    else if (reviewResult?.reviewAnswer === "RED") {

      console.log("❌ KYC rejected for:", mobile);

    }

    res.sendStatus(200);

  } catch (err) {

    console.error("❌ Sumsub webhook error:", err);

    res.sendStatus(500);

  }

};

