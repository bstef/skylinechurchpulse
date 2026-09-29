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

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e;">
      <h2 style="margin-bottom:4px;">Skyline Pulse — Weekly Digest</h2>
      <p style="color:#666;margin-top:0;">${rangeLabel}</p>

      <h3 style="margin-bottom:6px;">Sunday Services</h3>
      <p>${entriesAvailable
        ? `${sundayEntries.length} service${sundayEntries.length === 1 ? "" : "s"} logged.
      Avg attendance ${fmtAvg(avg(sundayEntries.map(e => e.attendance)))},
      avg unity ${fmtAvg(avg(sundayEntries.map(e => e.unity)))}/5,
      avg engagement ${fmtAvg(avg(sundayEntries.map(e => e.engagement)))}/5.`
        : "Not available this week."}</p>

      <h3 style="margin-bottom:6px;">SkyYouth</h3>
      <p>${entriesAvailable
        ? `${skyYouthEntries.length} service${skyYouthEntries.length === 1 ? "" : "s"} logged.
      Avg attendance ${fmtAvg(avg(skyYouthEntries.map(e => e.attendance)))}.`
        : "Not available this week."}</p>

      <h3 style="margin-bottom:6px;">Production</h3>
      <p>${productionAvailable ? `${production.length} log${production.length === 1 ? "" : "s"} recorded this week.` : "Not available this week."}</p>

      <h3 style="margin-bottom:6px;">Planning Center</h3>
      <p>See <a href="${APP_URL}" style="color:#2876ff;">Planning Center Responses in the app</a> for who's still owed a response this week.</p>

      <p style="margin-top:24px;"><a href="${APP_URL}" style="color:#2876ff;">Open Skyline Pulse →</a></p>
    </div>`;

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
    ctx.waitUntil(sendDigest(env));
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
