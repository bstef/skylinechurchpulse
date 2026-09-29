// Cloudflare Pages Function — the on-demand "Email report" button on the
// Exports page. The browser already builds the CSV/PDF (same code used for
// the download buttons), so this just forwards it as an email attachment to
// whoever's configured in the email_recipients table, via Resend.
//
// RESEND_API_KEY, SUPABASE_URL, and SUPABASE_ANON_KEY are Pages secrets
// (same pattern as PCO_APP_ID/PCO_SECRET). The Supabase URL/anon key are
// the same public values already committed in index.html — this app has
// no login, so the anon key (paired with fully-open RLS) was never a
// secret, see db/schema.sql's own comment on that model — but they're read
// from env here rather than duplicated as a literal, so there's one place
// to rotate them and secret scanners don't flag copies of a JWT-shaped key.

const FROM_ADDRESS = "Skyline Pulse <pulse@skylinechurch.tech>";

// Belt-and-suspenders cap on attachment size — Resend's own limit is 40MB
// per request, but a report this large almost certainly means the client
// sent something unintended (e.g. a raw file instead of base64).
const MAX_CONTENT_BASE64_CHARS = 15_000_000;

// Unlike this app's other endpoints, a call here has a real cost (a Resend
// send) and can damage the verified sender domain's reputation if abused —
// there's no login to gate it behind, so this is a same-origin check: it
// stops casual scanners/bots hitting the URL directly, though (being an
// Origin header) it isn't cryptographically strong against a deliberate
// attacker. Pair with a Cloudflare Rate Limiting Rule on this path (see
// README's Email integration section) for real abuse resistance.
function isAllowedOrigin(request) {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  let hostname;
  try {
    hostname = new URL(origin).hostname;
  } catch (err) {
    return false;
  }
  return hostname === "skylinechurch.tech"
    || hostname.endsWith(".skylinechurch.tech")
    || hostname === "skylinechurchpulse.pages.dev"
    || hostname.endsWith(".skylinechurchpulse.pages.dev");
}

async function fetchRecipients(supabaseUrl, supabaseAnonKey) {
  const res = await fetch(`${supabaseUrl}/rest/v1/email_recipients?select=email`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  });
  if (!res.ok) throw new Error(`Couldn't load recipients (${res.status})`);
  const rows = await res.json();
  return rows.map(r => r.email);
}

export async function onRequestPost(context) {
  const { RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } = context.env;
  if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: "Email isn't configured yet (missing RESEND_API_KEY, SUPABASE_URL, or SUPABASE_ANON_KEY)." }, 500);
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
  if (!dataset || !filename || !contentBase64 || !contentType) {
    return json({ error: "Missing dataset, filename, contentBase64, or contentType." }, 400);
  }
  if (contentBase64.length > MAX_CONTENT_BASE64_CHARS) {
    return json({ error: "That report is too large to email." }, 413);
  }

  let recipients;
  try {
    recipients = await fetchRecipients(SUPABASE_URL, SUPABASE_ANON_KEY);
  } catch (err) {
    return json({ error: err.message }, 502);
  }
  if (recipients.length === 0) {
    return json({ error: "No recipients configured yet — add one on the Exports page." }, 400);
  }

  const label = dataset.charAt(0).toUpperCase() + dataset.slice(1);
  const sentDate = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

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
        subject: `Skyline Pulse — ${label} report (${sentDate})`,
        html: `<p>Attached: the ${label} report exported from Skyline Pulse on ${sentDate}.</p>`,
        attachments: [{ filename, content: contentBase64, content_type: contentType }],
      }),
    });
  } catch (err) {
    return json({ error: "Failed to reach Resend: " + err.message }, 502);
  }

  if (!resendRes.ok) {
    const errBody = await resendRes.json().catch(() => ({}));
    return json({ error: errBody.message || `Resend error (${resendRes.status})` }, resendRes.status);
  }

  return json({ ok: true, sent_to: recipients.length });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
