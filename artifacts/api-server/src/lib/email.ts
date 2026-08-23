import { logger } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = process.env["RESEND_API_KEY"];
  const fromEmail = process.env["EMAIL_FROM"];

  if (!apiKey || !fromEmail) {
    if (process.env.NODE_ENV === "production") {
      logger.error(
        { to: message.to, subject: message.subject },
        "Email not sent — RESEND_API_KEY or EMAIL_FROM not configured",
      );
    } else {
      logger.info(
        { to: message.to, subject: message.subject },
        "Email skipped (dev mode — RESEND_API_KEY not configured)",
      );
    }
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Email send failed (${response.status}): ${body}`);
  }

  logger.info({ to: message.to, subject: message.subject }, "Email sent");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendPasswordResetEmail(
  to: string,
  token: string,
  siteUrl: string,
): Promise<void> {
  const resetUrl = `${siteUrl}/account?reset=${encodeURIComponent(token)}`;

  const subject = "Reset your Sportyra News password";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset</title>
</head>
<body style="margin:0;padding:0;background:#f7f2e8;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#ed5a3b;padding:24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:20px;">Sportyra News</h1>
    </div>
    <div style="padding:32px 24px;">
      <h2 style="color:#1a1a1a;margin:0 0 16px;font-size:18px;">Password Reset</h2>
      <p style="color:#555;line-height:1.6;margin:0 0 24px;">
        We received a request to reset the password for <strong>${escapeHtml(to)}</strong>.
        Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.
      </p>
      <a href="${escapeHtml(resetUrl)}"
         style="display:inline-block;background:#ed5a3b;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:15px;">
        Reset Password
      </a>
      <p style="color:#999;font-size:13px;line-height:1.5;margin:24px 0 0;">
        If you did not request this, you can safely ignore this email.
        The link will expire automatically and your password will remain unchanged.
      </p>
    </div>
    <div style="background:#fafafa;padding:16px 24px;text-align:center;border-top:1px solid #eee;">
      <p style="color:#aaa;font-size:12px;margin:0;">Sportyra News — Independent Sports Journalism</p>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `Sportyra News — Password Reset`,
    ``,
    `We received a request to reset the password for ${to}.`,
    ``,
    `Reset your password (link expires in 1 hour):`,
    resetUrl,
    ``,
    `If you did not request this, you can safely ignore this email.`,
  ].join("\n");

  await sendEmail({ to, subject, html, text });
}
