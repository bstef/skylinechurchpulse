// Cloudflare Pages Function — the on-demand "Email report" button on the
// Exports page. The browser already builds the CSV/PDF (same code used for
// the download buttons), so this just forwards it as an email attachment to
// whoever's configured in the email_recipients table, via Resend.
//
// D1 DB binding and RESEND_API_KEY stay server-side. Preview sends are disabled.
import { recipients as fetchRecipients, logEmail } from "../../lib/d1-store.js";

const FROM_ADDRESS = "Skyline Pulse <pulse@skylinechurch.tech>";

// Belt-and-suspenders cap on attachment size — Resend's own limit is 40MB
// per request, but a report this large almost certainly means the client
// sent something unintended (e.g. a raw file instead of base64).
const MAX_CONTENT_BASE64_CHARS = 15_000_000;

// Signed Access authentication is enforced by api/_middleware.js.
// Require the same browser origin for report sends as an additional CSRF check.
function isAllowedOrigin(request) {
  return request.headers.get("Origin") === new URL(request.url).origin;
}

async function logEmailSend(db, details) {
  return logEmail(db, { kind: "report", ...details });
}

export async function onRequestPost(context) {
  const { RESEND_API_KEY, DB } = context.env;
  if (context.env.EMAIL_ENABLED !== "true" || context.env.CF_PAGES_BRANCH !== "main") {
    return json({ error: "Email sending is disabled in this environment." }, 403);
  }
  if (!RESEND_API_KEY || !DB) {
    return json({ error: "Email isn't configured yet (missing RESEND_API_KEY or database binding)." }, 500);
  }
  if (!isAllowedOrigin(context.request)) {
    return json({ error: "Forbidden" }, 403);
  }

  let body;
  try {
    body = await context.request.json();
  } catch (err) {
    return json({ error: "Invalid request body." }, 400);
  }

  const { dataset, filename, contentBase64, contentType } = body || {};
  if (!["services", "production", "skyyouth"].includes(dataset) || typeof filename !== "string" || typeof contentBase64 !== "string" || typeof contentType !== "string") {
    return json({ error: "Missing dataset, filename, contentBase64, or contentType." }, 400);
  }
  if (contentBase64.length > MAX_CONTENT_BASE64_CHARS) {
    return json({ error: "That report is too large to email." }, 413);
  }

  let recipients;
  try {
    recipients = await fetchRecipients(DB);
  } catch (err) {
    return json({ error: err.message }, 502);
  }
  if (recipients.length === 0) {
    return json({ error: "No recipients configured yet — add one on the Exports page." }, 400);
  }

  const label = dataset.charAt(0).toUpperCase() + dataset.slice(1);
  const sentDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const subject = `Skyline Pulse — ${label} report (${sentDate})`;
  // The PDF attachment is the real content — it isn't archived here (could
  // be large, and email_log is meant to stay small), so the stored preview
  // is just the note that went alongside it, not the report itself.
  const html = `<p>Attached: the ${label} report exported from Skyline Pulse on ${sentDate}.</p>`;

  let resendRes;
  try {
    resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: recipients,
        subject,
        html,
        attachments: [{ filename, content: contentBase64, content_type: contentType }],
      }),
    });
  } catch (err) {
    await logEmailSend(DB, { dataset, subject, recipients, status: "failed", error: err.message, htmlBody: html });
    return json({ error: "Failed to reach Resend: " + err.message }, 502);
  }

  if (!resendRes.ok) {
    const errBody = await resendRes.json().catch(() => ({}));
    const error = errBody.message || `Resend error (${resendRes.status})`;
    await logEmailSend(DB, { dataset, subject, recipients, status: "failed", error, htmlBody: html });
    return json({ error }, resendRes.status);
  }

  await logEmailSend(DB, { dataset, subject, recipients, status: "sent", htmlBody: html });
  return json({ ok: true, sent_to: recipients.length });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
