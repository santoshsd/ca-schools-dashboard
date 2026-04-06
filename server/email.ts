import nodemailer from "nodemailer";
import { env } from "./env";

function isSmtpConfigured(): boolean {
  return !!env.SMTP_HOST && !!env.SMTP_USER && !!env.SMTP_PASS;
}

function createTransport() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

export async function sendPasswordResetEmail(
  toEmail: string,
  resetUrl: string,
): Promise<void> {
  const subject = "Reset your CA School Data Hub password";
  const html = `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #f8fafc; border-radius: 8px;">
      <h2 style="margin: 0 0 8px; color: #1e293b;">Password Reset</h2>
      <p style="color: #475569; margin: 0 0 24px;">
        We received a request to reset your password for your CA School Data Hub account.
        Click the button below to choose a new password. This link expires in <strong>10 minutes</strong>.
      </p>
      <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 600;">
        Reset Password
      </a>
      <p style="color: #94a3b8; font-size: 13px; margin: 24px 0 0;">
        If you didn't request this, you can safely ignore this email. Your password won't change.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">
        Or copy this link: <a href="${resetUrl}" style="color: #2563eb;">${resetUrl}</a>
      </p>
    </div>
  `;
  const text = `Reset your CA School Data Hub password\n\nVisit this link to choose a new password (expires in 10 minutes):\n\n${resetUrl}\n\nIf you didn't request this, ignore this email.`;

  if (!isSmtpConfigured()) {
    console.log("\n[Email — SMTP not configured, printing to console]");
    console.log(`  To:      ${toEmail}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Link:    ${resetUrl}\n`);
    return;
  }

  const transport = createTransport();
  await transport.sendMail({
    from: `"CA School Data Hub" <${env.SMTP_FROM}>`,
    to: toEmail,
    subject,
    html,
    text,
  });
}
