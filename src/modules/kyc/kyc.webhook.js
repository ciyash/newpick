import db from "../../config/db.js";
import { logActivity } from "../../utils/activity.logger.js";

export const sumsubWebhook = async (req, res) => {

  const { externalUserId, reviewResult } = req.body;

  if (reviewResult?.reviewAnswer === "GREEN") {

    await db.query(
      "UPDATE kyc_sessions SET age_verified=1 WHERE mobile=?",
      [externalUserId]
    );

    const [[user]] = await db.query(
      `SELECT id FROM users WHERE mobile = ? LIMIT 1`,
      [externalUserId]
    );

    if (user) {
      logActivity({
        userId:      user.id,
        type:        "kyc",
        sub_type:    "age_verified",
        title:       "KYC Verified",
        description: "Age verification completed successfully",
        icon:        "kyc",
      });
    }

  }
  res.send("ok");
};


// export const sumsubWebhook = async (req, res) => {

//   try {

//     const { externalUserId, reviewResult, levelName } = req.body;

//     console.log("SUMSUB WEBHOOK:", req.body);

//     const reviewAnswer = reviewResult?.reviewAnswer;

//     if (reviewAnswer === "GREEN") {

//       /* AGE VERIFICATION */

//       if (levelName === "age-verification") {

//         await db.query(
//           "UPDATE kyc_sessions SET age_verified = 1 WHERE mobile = ?",
//           [externalUserId]
//         );

//         console.log("AGE VERIFIED:", externalUserId);

//       }

//       /* ADDRESS VERIFICATION */

//       if (levelName === "address-verification") {

//         await db.query(
//           "UPDATE users SET address_verified = 1 WHERE mobile = ?",
//           [externalUserId]
//         );

//         console.log("ADDRESS VERIFIED:", externalUserId);

//       }

//     }

//     res.sendStatus(200);

//   } catch (error) {

//     console.error("Sumsub webhook error:", error);

//     res.sendStatus(500);

//   }

// };