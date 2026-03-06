import { sendMail } from './send.mail.js';

export const sendVerificationEmail = async (email, verifyLink) => {

  await sendMail({
    to: email,
    subject: "Verify your PICK2WIN account",
    html: `
      <h2>Email Verification</h2>
      <p>Click below to verify your email</p>

      <a href="${verifyLink}"
      style="
      padding:10px 20px;
      background:#28a745;
      color:white;
      text-decoration:none;
      border-radius:5px;
      ">
      Verify Email
      </a>
    `
  });

};