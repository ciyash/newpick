import db from "../../config/db.js";



export const sumsubWebhook = async (req, res) => {
  try {
    const { applicantId, reviewResult } = req.body;

    if (!applicantId) {
      return res.status(400).send("Applicant ID missing");
    }

    let status = "pending";

    if (reviewResult?.reviewAnswer === "GREEN") {
      status = "approved";
    } else if (reviewResult?.reviewAnswer === "RED") {
      status = "rejected";
    }

    await db.query(
      "UPDATE users SET kyc_status=? WHERE sumsub_applicant_id=?",
      [status, applicantId]
    );

    console.log("KYC updated:", applicantId, status);

    res.send("OK");

  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
};