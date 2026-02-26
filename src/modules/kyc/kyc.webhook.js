import db from "../../config/db.js";

export const sumsubWebhook = async (req, res) => {
  try {
    const { applicantId, reviewStatus } = req.body;

    let status = "pending";

    if (reviewStatus === "completed") status = "approved";
    if (reviewStatus === "rejected") status = "rejected";

    await db.query(
      "UPDATE users SET kyc_status=? WHERE sumsub_applicant_id=?",
      [status, applicantId]
    );

    res.send("OK");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
};