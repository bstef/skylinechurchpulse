// TEMPORARY diagnostic endpoint — NOT wired into the app UI anywhere.
// Dumps raw Planning Center Check-Ins API responses (events, event periods,
// and a few candidate ways of getting a per-service breakdown within a
// period) so the real shape of a specific org's data can be inspected
// without guessing against public API docs. Visit e.g.
//   /api/pco-checkins-debug?days=21
// in a browser — it just returns JSON, no auth beyond the existing PCO
// token already configured for this deployment. Delete this file once the
// attendance-matching bug it's diagnosing is confirmed fixed.

const CHECKINS_BASE = "https://api.planningcenteronline.com/check-ins/v2";

export async function onRequestGet(context) {
  const { PCO_APP_ID, PCO_SECRET } = context.env;
  if (!PCO_APP_ID || !PCO_SECRET) {
    return json({ error: "PCO credentials not configured" }, 500);
  }
  const headers = {
    Authorization: "Basic " + btoa(`${PCO_APP_ID}:${PCO_SECRET}`),
    Accept: "application/json",
  };

  const url = new URL(context.request.url);
  const days = Number(url.searchParams.get("days") || 21);
  const windowStart = Date.now() - days * 86400000;

  const eventsRes = await fetch(`${CHECKINS_BASE}/events?per_page=100`, { headers });
  if (!eventsRes.ok) {
    return json({ error: `events fetch failed: ${eventsRes.status}`, body: await safeText(eventsRes) }, 502);
  }
  const eventsBody = await eventsRes.json();
  const events = (eventsBody.data || []).filter(e => !e.attributes.archived_at);

  const out = { window_days: days, events: [] };

  for (const ev of events) {
    const eventOut = {
      id: ev.id,
      name: ev.attributes.name,
      periods: [],
    };

    const periodsRes = await fetch(`${CHECKINS_BASE}/events/${ev.id}/event_periods?order=-starts_at&per_page=10`, { headers });
    if (!periodsRes.ok) {
      eventOut.periods_error = { status: periodsRes.status, body: await safeText(periodsRes) };
      out.events.push(eventOut);
      continue;
    }
    const periodsBody = await periodsRes.json();
    const periods = (periodsBody.data || []).filter(
      p => p.attributes.starts_at && new Date(p.attributes.starts_at).getTime() >= windowStart
    );

    for (const period of periods) {
      const periodOut = {
        id: period.id,
        starts_at: period.attributes.starts_at,
        regular_count: period.attributes.regular_count,
        guest_count: period.attributes.guest_count,
        volunteer_count: period.attributes.volunteer_count,
        raw_attributes: period.attributes,
        attempts: {},
      };

      periodOut.attempts.event_times_nested = await tryFetch(
        `${CHECKINS_BASE}/events/${ev.id}/event_periods/${period.id}/event_times?per_page=25`,
        headers
      );
      periodOut.attempts.event_period_with_include = await tryFetch(
        `${CHECKINS_BASE}/events/${ev.id}/event_periods/${period.id}?include=event_times`,
        headers
      );
      periodOut.attempts.headcounts_nested = await tryFetch(
        `${CHECKINS_BASE}/events/${ev.id}/event_periods/${period.id}/headcounts?per_page=25`,
        headers
      );
      periodOut.attempts.location_event_periods = await tryFetch(
        `${CHECKINS_BASE}/events/${ev.id}/event_periods/${period.id}/location_event_periods?per_page=25`,
        headers
      );

      eventOut.periods.push(periodOut);
    }

    out.events.push(eventOut);
  }

  return json(out);
}

async function tryFetch(url, headers) {
  try {
    const r = await fetch(url, { headers });
    const text = await r.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (err) {
      body = text;
    }
    return { status: r.status, ok: r.ok, body: trimBody(body) };
  } catch (err) {
    return { error: err.message };
  }
}

function trimBody(body) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  if (text.length <= 6000) return body;
  return typeof body === "string" ? text.slice(0, 6000) + "…[truncated]" : { truncated: true, preview: text.slice(0, 6000) };
}

async function safeText(res) {
  try {
    return await res.text();
  } catch (err) {
    return null;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
