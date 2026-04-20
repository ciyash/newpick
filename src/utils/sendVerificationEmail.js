import { sendMail } from './send.mail.js';

export const sendVerificationEmail = async (email, verifyLink) => {

  await sendMail({
    to: email,
    subject: "Verify your PICK2WIN account",
    html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">

          <!-- Header -->
          <tr>
            <td align="center" style="background:#1a1a2e;padding:32px 40px;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:1px;">PICK2WIN</h1>
              <p style="margin:6px 0 0;color:#a0aec0;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Fantasy Sports Platform</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <h2 style="margin:0 0 12px;font-size:22px;color:#1a1a2e;font-weight:700;">Verify your email</h2>
              <p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.7;">
                Thanks for signing up! Click the button below to verify your email address and activate your account.
              </p>

              <!-- Button -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding:8px 0 28px;">
                    <a href="${verifyLink}" style="display:inline-block;background:#28a745;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 40px;border-radius:8px;letter-spacing:0.5px;">Verify Email Address</a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="border-top:1px solid #e2e8f0;padding-top:24px;">
                    <p style="margin:0 0 8px;font-size:13px;color:#718096;">Button not working? Copy and paste this link into your browser:</p>
                    <p style="margin:0;word-break:break-all;font-size:12px;color:#3182ce;">${verifyLink}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Warning -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table cellpadding="0" cellspacing="0" width="100%" style="background:#fff8e1;border-left:4px solid #f6ad55;border-radius:4px;">
                <tr>
                  <td style="padding:12px 16px;">
                    <p style="margin:0;font-size:13px;color:#744210;">This link will expire in <strong>24 hours</strong>. If you did not create an account, please ignore this email.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background:#f7fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#a0aec0;">&copy; 2026 PICK2WIN. All rights reserved.</p>
              <p style="margin:4px 0 0;font-size:12px;color:#a0aec0;">This is an automated email, please do not reply.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
  });

};