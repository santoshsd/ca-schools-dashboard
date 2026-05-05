// Email delivery via Resend.
// Falls back to console.log when RESEND_API_KEY is not set (local dev).
import { Resend } from "resend";

// Verified sender domain configured in Resend.
const VERIFIED_FROM = "no-reply@caschooldatahub.s13i.me";

function getResendClient(): { client: Resend; fromEmail: string } {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY environment variable is not set");
  }
  return { client: new Resend(apiKey), fromEmail: VERIFIED_FROM };
}

// Build a "Name <email>" sender string.
// If the configured fromEmail domain isn't verified in Resend, use the shared
// test sender so the API call doesn't fail outright.
function buildFrom(fromEmail: string): string {
  return `CA School Data Hub <${fromEmail}>`;
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

  try {
    const { client, fromEmail } = getResendClient();
    const result = await client.emails.send({
      from: buildFrom(fromEmail),
      to: toEmail,
      subject,
      html,
      text,
    });
    if (result.error) {
      throw new Error(result.error.message ?? JSON.stringify(result.error));
    }
    console.log(`[Email] Reset email sent to ${toEmail} (id: ${result.data?.id})`);
  } catch (e: any) {
    // Graceful fallback: log the link so it is never silently lost.
    console.warn(`[Email] Resend unavailable (${e?.message ?? e}), printing reset link to console:`);
    console.log(`  To:      ${toEmail}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Link:    ${resetUrl}`);
  }
}

export async function sendTestEmail(toEmail: string): Promise<{ ok: boolean; message: string }> {
  try {
    const { client, fromEmail } = getResendClient();
    const result = await client.emails.send({
      from: buildFrom(fromEmail),
      to: toEmail,
      subject: "Test email — CA School Data Hub",
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #f8fafc; border-radius: 8px;">
          <h2 style="margin: 0 0 8px; color: #1e293b;">Email delivery is working!</h2>
          <p style="color: #475569;">This is a test email from the CA School Data Hub. If you received this, transactional email is configured correctly via Resend.</p>
        </div>
      `,
      text: "Email delivery is working! This is a test email from CA School Data Hub.",
    });

    if (result.error) {
      return { ok: false, message: result.error.message ?? JSON.stringify(result.error) };
    }
    return { ok: true, message: `Sent successfully (id: ${result.data?.id})` };
  } catch (e: any) {
    return { ok: false, message: e?.message ?? String(e) };
  }
}
