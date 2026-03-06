import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

export const sendMail = async (options) => {

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: options.to,
    subject: options.subject,
    html: options.html
  });

};