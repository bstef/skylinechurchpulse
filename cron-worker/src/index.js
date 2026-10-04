// Standalone Cloudflare Worker — the weekly digest's actual scheduler.
//
// This does NOT live in functions/api/ (the Pages project) because the
// church's Cloudflare Access policy protects the whole skylinechurch.tech
// domain (and its .pages.dev alias), so any external HTTP call — including
// a GitHub Actions cron hitting a Pages Function's URL — gets redirected to
// an Access login page it can never complete. A Worker's own Cron Trigger
// fires internally within Cloudflare's infrastructure: it's not an inbound
// HTTP request to the protected zone at all, so Access never sees it and
// nothing about the existing Access policy needs to change.
//
// Deployed separately from the Pages project via `wrangler deploy` in this
// directory (see README's Email integration section). Needs its own copy
// of RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, and DIGEST_TEST_SECRET
// set as Worker secrets — this Worker doesn't share the Pages project's
// secret store.
//
// Trade-off vs. the earlier Pages Function version: this reads Services/
// Production/SkyYouth straight from Supabase (same as before) but does NOT
// include the Planning Center "needs response" section, since that would
// mean either re-implementing the Planning Center API calls a third time or
// calling back through the Access-protected /api/pco-stats — the digest
// links into the app for that instead.

const FROM_ADDRESS = "Skyline Pulse <pulse@skylinechurch.tech>";
const DIGEST_WINDOW_DAYS = 7;
const APP_URL = "https://skylinechurch.tech";
const PLANNING_CENTER_URL = "https://services.planningcenteronline.com/dashboard/0";
const LOGO_URL = "https://skylinechurch.tech/assets/SkylinePulseLight-removebg-preview.png";

// Brand palette, lifted from index.html's light-theme CSS variables so the
// email matches the app instead of inventing its own colors.
const COLOR = {
  ink: "#1F2A24",
  paper: "#F6F3EC",
  surface: "#FFFFFF",
  brass: "#B8925A",
  pew: "#2876FF",
  line: "#D8D1C0",
  muted: "#8A8375",
};

async function fetchRecipients(supabaseUrl, supabaseAnonKey) {
  const res = await fetch(`${supabaseUrl}/rest/v1/email_recipients?select=email`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
  });
  if (!res.ok) throw new Error(`Couldn't load recipients (${res.status})`);
  const rows = await res.json();
  return rows.map(r => r.email);
}

async function fetchRecentEntries(supabaseUrl, supabaseAnonKey, table, sinceIso) {
  const url = `${supabaseUrl}/rest/v1/${table}?select=*&service_date=gte.${sinceIso}&order=service_date.desc`;
  const res = await fetch(url, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
  });
  if (!res.ok) throw new Error(`Couldn't load ${table} (${res.status})`);
  return res.json();
}

function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function fmtAvg(n) { return n == null ? "—" : n.toFixed(1); }
function fmtAvgInt(n) { return n == null ? "—" : Math.round(n).toString(); }

// One stat block per dataset — icon + label, then the line of numbers,
// separated by a thin rule except after the last one.
function digestSection(icon, label, body, isLast) {
  return `
          <tr>
            <td style="padding:16px 0;${isLast ? "" : `border-bottom:1px solid ${COLOR.line};`}">
              <div style="font-size:14px;font-weight:700;color:${COLOR.ink};margin:0 0 4px;">${icon}&nbsp; ${label}</div>
              <div style="font-size:14px;color:${COLOR.muted};line-height:1.55;">${body}</div>
            </td>
          </tr>`;
}

// Table-based layout (not flex/grid) so this renders consistently across
// email clients, including Outlook's Word rendering engine. Colors pulled
// from index.html's light-theme CSS variables (see COLOR above) so the
// email reads as the same product as the app, not a generic notification.
function buildDigestHtml({ rangeLabel, entriesAvailable, productionAvailable, sundayEntries, skyYouthEntries, production }) {
  const sections = [
    digestSection("🗓️", "Sunday Services", entriesAvailable
      ? `${sundayEntries.length} service${sundayEntries.length === 1 ? "" : "s"} logged · avg attendance ${fmtAvgInt(avg(sundayEntries.map(e => e.attendance)))} · avg unity ${fmtAvg(avg(sundayEntries.map(e => e.unity)))}/5 · avg engagement ${fmtAvg(avg(sundayEntries.map(e => e.engagement)))}/5`
      : "Not available this week."),
    digestSection("🎧", "SkyYouth", entriesAvailable
      ? `${skyYouthEntries.length} service${skyYouthEntries.length === 1 ? "" : "s"} logged · avg attendance ${fmtAvgInt(avg(skyYouthEntries.map(e => e.attendance)))}`
      : "Not available this week."),
    digestSection("🎛️", "Production", productionAvailable
      ? `${production.length} log${production.length === 1 ? "" : "s"} recorded this week`
      : "Not available this week."),
    digestSection("🙋", "Planning Center", `See <a href="${APP_URL}" style="color:${COLOR.pew};">Planning Center Responses in the app</a> for who's still owed a response this week.`, true),
  ].join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Skyline Pulse — Weekly Digest</title>
</head>
<body style="margin:0;padding:0;background-color:${COLOR.paper};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR.paper};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${COLOR.surface};border:1px solid ${COLOR.line};border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:32px 36px 20px;text-align:center;border-bottom:1px solid ${COLOR.line};">
              <img src="${LOGO_URL}" width="170" alt="Skyline Pulse" style="display:block;margin:0 auto;height:auto;max-width:170px;border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px 4px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${COLOR.brass};margin:0 0 6px;">Weekly Digest</div>
              <h1 style="margin:0;font-size:21px;font-family:Georgia,'Times New Roman',serif;color:${COLOR.ink};font-weight:700;">${rangeLabel}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 36px 4px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sections}</table>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 36px 32px;text-align:center;">
              <a href="${APP_URL}" style="display:inline-block;background-color:${COLOR.pew};color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;padding:13px 30px;border-radius:8px;">Open Skyline Pulse →</a>
            </td>
          </tr>
          <tr>
            <td style="background-color:${COLOR.paper};padding:22px 36px;text-align:center;border-top:1px solid ${COLOR.line};">
              <div style="margin:0 0 10px;">
                <a href="${APP_URL}" style="color:${COLOR.brass};text-decoration:none;font-weight:600;font-size:13px;margin:0 12px;">Open Skyline Pulse</a>
                <a href="${PLANNING_CENTER_URL}" style="color:${COLOR.brass};text-decoration:none;font-weight:600;font-size:13px;margin:0 12px;">Planning Center</a>
              </div>
              <div style="font-size:11px;color:${COLOR.muted};">Skyline Church · NJ &nbsp;·&nbsp; Skyline Pulse Service Ledger &nbsp;·&nbsp; Internal use only</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendDigest(env) {
  const { RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } = env;
  if (!RESEND_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return { ok: false, error: "Missing RESEND_API_KEY, SUPABASE_URL, or SUPABASE_ANON_KEY." };
  }

  const sinceIso = new Date(Date.now() - DIGEST_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  const [recipientsResult, entriesResult, productionResult] = await Promise.all([
    fetchRecipients(SUPABASE_URL, SUPABASE_ANON_KEY).catch(err => ({ error: err.message })),
    fetchRecentEntries(SUPABASE_URL, SUPABASE_ANON_KEY, "service_entries", sinceIso).catch(err => ({ error: err.message })),
    fetchRecentEntries(SUPABASE_URL, SUPABASE_ANON_KEY, "production_entries", sinceIso).catch(err => ({ error: err.message })),
  ]);

  if (recipientsResult.error) return { ok: false, error: recipientsResult.error };
  const recipients = recipientsResult;
  if (recipients.length === 0) return { ok: true, sent_to: 0, note: "No recipients configured — nothing sent." };

  const entriesAvailable = Array.isArray(entriesResult);
  const productionAvailable = Array.isArray(productionResult);
  const entries = entriesAvailable ? entriesResult : [];
  const production = productionAvailable ? productionResult : [];
  const sundayEntries = entries.filter(e => e.service_type !== "SkyYouth");
  const skyYouthEntries = entries.filter(e => e.service_type === "SkyYouth");

  const rangeLabel = `${new Date(sinceIso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const html = buildDigestHtml({ rangeLabel, entriesAvailable, productionAvailable, sundayEntries, skyYouthEntries, production });

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: recipients,
      subject: `Skyline Pulse — Weekly Digest (${rangeLabel})`,
      html,
    }),
  });

  if (!resendRes.ok) {
    const errBody = await resendRes.json().catch(() => ({}));
    return { ok: false, error: errBody.message || `Resend error (${resendRes.status})` };
  }

  return { ok: true, sent_to: recipients.length };
}

export default {
  // The real trigger — Cloudflare fires this internally on the cron
  // schedule in wrangler.toml. Two crons cover Eastern's DST offsets, so
  // only send when it's actually 8am Eastern to avoid a double-send.
  async scheduled(event, env, ctx) {
    const hour = new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: "America/New_York" }).format(new Date());
    if (hour !== "08") return;
    // sendDigest() resolves (never rejects) even on failure — a plain
    // waitUntil(sendDigest(env)) would make a failed send look like a
    // successful scheduled run in Cloudflare's logs, with no error and no
    // way to notice a Monday digest silently didn't go out. Throw so the
    // invocation actually shows up as failed.
    ctx.waitUntil((async () => {
      const result = await sendDigest(env);
      if (!result.ok) throw new Error(result.error || "sendDigest failed");
    })());
  },

  // Manual test path — hits this Worker's own workers.dev URL directly,
  // which is NOT covered by the church's Access policy (that's scoped to
  // skylinechurch.tech/.pages.dev, not this Worker's own domain). Gated by
  // its own shared secret since, like the scheduled send, a call here has
  // a real cost.
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    const provided = request.headers.get("X-Digest-Secret");
    if (!env.DIGEST_TEST_SECRET || provided !== env.DIGEST_TEST_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }
    const result = await sendDigest(env);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    });
  },
};
