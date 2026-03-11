import nodemailer from "nodemailer";

export const sendOtpEmail = async (email, subject, pdfBuffer) => {

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: `"PICK2WIN" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: subject,
    text: "Please find attached your wallet transaction statement.",
    attachments: [
      {
        filename: "wallet-transactions.pdf",
        content: pdfBuffer
      }
    ]
  });

};