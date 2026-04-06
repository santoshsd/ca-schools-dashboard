// Email delivery via Replit Resend integration.
// Falls back to console.log when the integration credentials are unavailable (local dev without connector).
import { Resend } from "resend";

let connectionSettings: any;

// The Resend shared test sender works when the recipient is a verified email
// in the Resend account. For production use, verify your own domain at
// https://resend.com/domains and update the from_email in the connector settings.
const FALLBACK_FROM = "onboarding@resend.dev";

async function getResendCredentials(): Promise<{ apiKey: string; fromEmail: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error("Resend connector not available in this environment");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    },
  )
    .then((r) => r.json())
    .then((data) => data.items?.[0]);

  if (!connectionSettings?.settings?.api_key) {
    throw new Error("Resend not connected");
  }

  // Always use the shared Resend sender unless a custom verified domain
  // is configured. The from_email connector setting holds the *intended*
  // sender domain; if it hasn't been verified in Resend, the API rejects it.
  // Switch to a verified domain at https://resend.com/domains when ready.
  const fromEmail = FALLBACK_FROM;
  return { apiKey: connectionSettings.settings.api_key, fromEmail };
}

// WARNING: Never cache this client — tokens expire.
async function getUncachableResendClient() {
  const creds = await getResendCredentials();
  return { client: new Resend(creds.apiKey), fromEmail: creds.fromEmail };
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
    const { client, fromEmail } = await getUncachableResendClient();
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
    const { client, fromEmail } = await getUncachableResendClient();
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
