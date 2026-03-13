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

    const { externalUserId, reviewResult, levelName } = req.body;

    const reviewAnswer = reviewResult?.reviewAnswer;

    console.log("SUMSUB WEBHOOK:", req.body);

    if (reviewAnswer === "GREEN") {

      /* AGE VERIFICATION (registration time) */

      if (levelName === "age-verification") {

        await db.query(
          "UPDATE kyc_sessions SET age_verified = 1 WHERE mobile = ?",
          [externalUserId]
        );

      }

      /* ADDRESS VERIFICATION (after login anytime) */

      if (levelName === "address-verification") {

        await db.query(
          "UPDATE users SET address_verified = 1 WHERE mobile = ?",
          [externalUserId]
        );

      }

    }

    res.sendStatus(200);

  } catch (error) {

    console.error("Sumsub webhook error:", error);

    res.sendStatus(500);

  }

};