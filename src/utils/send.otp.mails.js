import { sendMail } from "./send.mail.js";

export const sendOtpEmail = async (email, data, isPdf = false) => {

  if (isPdf) {

    await sendMail({
      to: email,
      subject: "PICK2WIN Wallet Transactions",
      text: "Please find your wallet transactions attached.",
      attachments: [
        {
          filename: "wallet-transactions.pdf",
          content: data
        }
      ]
    });

  } else {

    const otp = data;

    await sendMail({
      to: email,
      subject: "PICK2WIN Security OTP",
      html: `
        <div style="font-family:Arial">

          <h2>PICK2WIN Security Code</h2>

          <p>Your OTP is:</p>

          <h1 style="
            background:#f4f4f4;
            padding:15px;
            text-align:center;
            letter-spacing:5px
          ">
            ${otp}
          </h1>

          <p>This OTP is valid for 5 minutes.</p>

          <p>If you didn't request this, please ignore.</p>

        </div>
      `
    });

  }

};