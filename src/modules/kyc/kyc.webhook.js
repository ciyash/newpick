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

    if (reviewAnswer === "GREEN") {

      /* AGE VERIFICATION */

      if (levelName === "age-verification") {

        await db.query(
          "UPDATE kyc_sessions SET age_verified = 1 WHERE mobile = ?",
          [externalUserId]
        );

      }

      /* ADDRESS VERIFICATION */

      if (levelName === "address-verification") {

        await db.query(
          "UPDATE users SET address_verified = 1 WHERE mobile = ?",
          [externalUserId]
        );

      }

    }

    res.send("ok");

  } catch (error) {

    console.error("Sumsub webhook error:", error);

    res.sendStatus(500);

  }

};