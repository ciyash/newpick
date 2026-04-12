import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

// ✅ Server start అయినప్పుడు SMTP connection verify చేస్తుంది
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ SMTP connection failed:", error.message);
  } else {
    console.log("✅ SMTP server connected — ready to send emails");
  }
});


export const sendMail = async (options) => {
  try {
    const info = await transporter.sendMail({
      // ✅ MAIL_FROM లేకపోతే EMAIL_FROM fallback
      from: process.env.MAIL_FROM || process.env.EMAIL_FROM,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: options.attachments
    });

    console.log("✅ Email sent:", info.messageId, "→", options.to);
    return info;

  } catch (err) {
    console.error("❌ sendMail failed:", err.message);
    throw err;
  }
};
