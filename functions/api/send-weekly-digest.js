// Cloudflare Pages Function — the automatic weekly digest email, triggered
// by a GitHub Actions cron job (see .github/workflows/weekly-digest.yml)
// every Monday 8am Eastern. Not reachable without the shared secret, since
// unlike this app's other (read-only, proxying) endpoints, a call here has
// a real-world side effect and cost: it sends an email to everyone
// configured on the Exports page.
//
// Reuses /api/pco-stats rather than re-implementing its Planning Center
// calls here, so the digest's Serving/Check-Ins numbers stay in lockstep
// with whatever the Church Stats and Planning Center Responses tabs show.
//
// SUPABASE_URL/SUPABASE_ANON_KEY are Pages secrets (same pattern as
// PCO_APP_ID/PCO_SECRET) rather than a literal here — they're the same
// public values already committed in index.html (this app has no login,
// so the anon key paired with fully-open RLS was never a secret, see
// db/schema.sql's own comment on that model), but reading them from env
// keeps one place to rotate them and avoids duplicating a JWT-shaped
// literal across files, which secret scanners flag regardless of context.

const FROM_ADDRESS = "Skyline Pulse <pulse@skylinechurch.tech>";
const DIGEST_WINDOW_DAYS = 7;

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

export async function onRequestPost(context) {
  const { RESEND_API_KEY, DIGEST_CRON_SECRET, SUPABASE_URL, SUPABASE_ANON_KEY } = context.env;
  if (!RESEND_API_KEY || !DIGEST_CRON_SECRET || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: "Digest isn't configured yet (missing RESEND_API_KEY, DIGEST_CRON_SECRET, SUPABASE_URL, or SUPABASE_ANON_KEY)." }, 500);
  }
  const providedSecret = context.request.headers.get("X-Digest-Secret");
  if (providedSecret !== DIGEST_CRON_SECRET) {
    return json({ error: "Unauthorized" }, 401);
  }

  const origin = new URL(context.request.url).origin;
  const sinceIso = new Date(Date.now() - DIGEST_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);

  const [recipientsResult, entriesResult, productionResult, statsResult] = await Promise.all([
    fetchRecipients(SUPABASE_URL, SUPABASE_ANON_KEY).catch(err => ({ error: err.message })),
    fetchRecentEntries(SUPABASE_URL, SUPABASE_ANON_KEY, "service_entries", sinceIso).catch(err => ({ error: err.message })),
    fetchRecentEntries(SUPABASE_URL, SUPABASE_ANON_KEY, "production_entries", sinceIso).catch(err => ({ error: err.message })),
    fetch(`${origin}/api/pco-stats`).then(r => r.ok ? r.json() : { error: `pco-stats (${r.status})` }).catch(err => ({ error: err.message })),
  ]);

  if (recipientsResult.error) return json({ error: recipientsResult.error }, 502);
  const recipients = recipientsResult;
  if (recipients.length === 0) {
    return json({ error: "No recipients configured — nothing sent." }, 200);
  }

  // A failed Supabase query is materially different from "nothing logged
  // this week" — render an explicit unavailable state for that section
  // instead of silently defaulting to zero, same as the Planning Center
  // section already does when /api/pco-stats fails.
  const entriesAvailable = Array.isArray(entriesResult);
  const productionAvailable = Array.isArray(productionResult);
  const entries = entriesAvailable ? entriesResult : [];
  const production = productionAvailable ? productionResult : [];
  const sundayEntries = entries.filter(e => e.service_type !== "SkyYouth");
  const skyYouthEntries = entries.filter(e => e.service_type === "SkyYouth");
  const serving = statsResult && !statsResult.error ? statsResult.serving : null;
  const checkins = statsResult && !statsResult.error ? statsResult.checkins : null;
  const latestCheckinTotal = checkins && !checkins.error && checkins.trend && checkins.trend.length
    ? checkins.trend[checkins.trend.length - 1].total
    : null;

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
      <p>${serving && !serving.error
        ? `${serving.needs_response} awaiting response, ${serving.confirmed} confirmed, ${serving.declined} declined, across ${serving.upcoming_plans} upcoming plan${serving.upcoming_plans === 1 ? "" : "s"}.`
        : "Not available this week."}</p>
      ${latestCheckinTotal != null ? `<p>Most recent Check-Ins headcount: ${latestCheckinTotal}.</p>` : ""}

      <p style="margin-top:24px;"><a href="https://skylinechurch.tech" style="color:#2876ff;">Open Skyline Pulse →</a></p>
    </div>`;

  let resendRes;
  try {
    resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: recipients,
        subject: `Skyline Pulse — Weekly Digest (${rangeLabel})`,
        html,
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
