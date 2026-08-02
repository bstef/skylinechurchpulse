// Cloudflare Pages Function — proxies Planning Center Services so the
// PCO Personal Access Token (PCO_APP_ID / PCO_SECRET) never reaches the browser.
// Configure both as Pages secrets (dashboard or `wrangler pages secret put`),
// and locally via a git-ignored `.dev.vars` file for `wrangler pages dev .`.

const PCO_BASE = "https://api.planningcenteronline.com/services/v2";
const CHECKINS_BASE = "https://api.planningcenteronline.com/check-ins/v2";
const WINDOW_DAYS_PAST = 14;
const WINDOW_DAYS_FUTURE = 45;
const CHURCH_TIMEZONE = "America/New_York";

// How close a Check-Ins "event time" has to be to a Plan's start to count as
// the same gathering. Services Plans and Check-Ins Events are separate PCO
// products with no direct link between them, so we match by date/time
// proximity instead of ID.
const ATTENDANCE_MATCH_WINDOW_MINUTES = 90;

// Check-Ins "Event" definitions that shouldn't feed into a Plan's attendance
// number — e.g. a volunteer-only or facilities check-in that happens to fall
// in the same time window. Tune this once you see your org's real Check-Ins
// event names show up. Leave empty to include every Check-Ins event.
const EXCLUDED_CHECKIN_EVENTS = [];

// PlanTime's own `name` attribute is often left blank in practice, so derive
// a readable local time (e.g. "9:30 AM") from `starts_at` as a fallback —
// this also matches Pulse's SERVICE_TYPES labels directly.
function localTimeLabel(iso) {
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: CHURCH_TIMEZONE }).format(new Date(iso));
  } catch (err) {
    return "";
  }
}

// Service Type folders that aren't worship/gathering events Pulse cares about
// (children's check-in, assimilation, etc.) — tune this list as your PCO org changes.
const EXCLUDED_SERVICE_TYPES = [
  "Check In, Baby Steps",
  "Little Steps, Handprints, Awana & Clubhouse Teams",
  "Assimilation",
  "First Impressions Teams Service Plan",
  "Childcare Services",
  "Facilities/Resources",
];

// Only these Service Type folders get expanded into one row per PlanTime.
// Some folders (e.g. SkyYOUTH) tag several internal timing checkpoints —
// soundcheck, doors, start, end — as time_type "service" even though they're
// all one gathering, not separate services; splitting on those produces
// bogus duplicate rows. Celebration Service genuinely has two distinct
// congregational services (9:30/11:00) recorded as separate PlanTimes.
// Add a folder name here only once you've confirmed its PlanTimes really do
// represent separate services.
const MULTI_TIME_SERVICE_TYPES = ["Celebration Service"];

export async function onRequestGet(context) {
  const { PCO_APP_ID, PCO_SECRET } = context.env;
  if (!PCO_APP_ID || !PCO_SECRET) {
    return json({ error: "PCO credentials not configured" }, 500);
  }

  const headers = {
    Authorization: "Basic " + btoa(`${PCO_APP_ID}:${PCO_SECRET}`),
    Accept: "application/json",
  };

  let serviceTypes;
  try {
    const typesRes = await fetch(`${PCO_BASE}/service_types?per_page=100`, { headers });
    if (!typesRes.ok) {
      return json({ error: `Planning Center error fetching service types (${typesRes.status})` }, typesRes.status);
    }
    const typesBody = await typesRes.json();
    serviceTypes = typesBody.data
      .map(t => ({ id: t.id, name: t.attributes.name }))
      .filter(t => !EXCLUDED_SERVICE_TYPES.some(ex => ex.toLowerCase() === t.name.toLowerCase()));
  } catch (err) {
    return json({ error: "Failed to reach Planning Center: " + err.message }, 502);
  }

  const windowStart = Date.now() - WINDOW_DAYS_PAST * 86400000;
  const windowEnd = Date.now() + WINDOW_DAYS_FUTURE * 86400000;
  const warnings = [];

  const plansPerType = await Promise.all(serviceTypes.map(async (st) => {
    let res;
    try {
      res = await fetch(`${PCO_BASE}/service_types/${st.id}/plans?order=-sort_date&per_page=25`, { headers });
    } catch (err) {
      warnings.push({ service_type_name: st.name, error: err.message });
      return [];
    }
    if (!res.ok) {
      warnings.push({ service_type_name: st.name, status: res.status });
      return [];
    }
    const body = await res.json();
    const rawPlans = body.data
      .filter(p => p.attributes.sort_date)
      .map(p => ({
        plan_id: p.id,
        title: p.attributes.title || st.name,
        series_title: p.attributes.series_title || "",
        service_type_id: st.id,
        service_type_name: st.name,
        sort_date: p.attributes.sort_date,
      }))
      .filter(p => {
        const t = new Date(p.sort_date).getTime();
        return t >= windowStart && t <= windowEnd;
      });

    // Pull the sermon/series artwork for each plan, if any is attached.
    await Promise.all(rawPlans.map(async (plan) => {
      try {
        const seriesRes = await fetch(`${PCO_BASE}/service_types/${st.id}/plans/${plan.plan_id}/series`, { headers });
        if (!seriesRes.ok) return;
        const seriesBody = await seriesRes.json();
        const seriesData = Array.isArray(seriesBody.data) ? seriesBody.data[0] : seriesBody.data;
        const attrs = seriesData && seriesData.attributes;
        if (attrs && attrs.has_artwork) {
          plan.artwork_url = attrs.artwork_for_dashboard || attrs.artwork_for_plan || attrs.artwork_original || null;
        }
      } catch (err) {
        // no series/artwork for this plan — leave artwork_url unset
      }
    }));

    // A single Plan can represent more than one physical gathering (e.g. one
    // "Celebration Service" Plan covers both a 9:30am and 11:00am service,
    // each as its own PlanTime). Expand each Plan into one row per actual
    // service time so they show up — and auto-match to a service type —
    // separately, instead of one ambiguous row. Only do this for folders
    // known to genuinely have multiple services (see MULTI_TIME_SERVICE_TYPES).
    const shouldSplit = MULTI_TIME_SERVICE_TYPES.some(name => name.toLowerCase() === st.name.toLowerCase());
    if (!shouldSplit) {
      return rawPlans.map(p => ({ ...p, id: p.plan_id }));
    }

    const expanded = await Promise.all(rawPlans.map(async (plan) => {
      let times = [];
      try {
        const timesRes = await fetch(`${PCO_BASE}/service_types/${st.id}/plans/${plan.plan_id}/plan_times`, { headers });
        if (timesRes.ok) {
          const timesBody = await timesRes.json();
          times = timesBody.data.filter(t => t.attributes.time_type === "service" && t.attributes.starts_at);
        }
      } catch (err) {
        // ignore — fall back to the plan-level date/name below
      }
      if (times.length === 0) return [plan];
      return times.map(t => ({
        ...plan,
        id: `${plan.plan_id}:${t.id}`,
        sort_date: t.attributes.starts_at,
        plan_time_name: t.attributes.name || localTimeLabel(t.attributes.starts_at),
      }));
    }));

    return expanded.flat().map(p => ({ ...p, id: p.id || p.plan_id }));
  }));

  const plans = plansPerType.flat().sort((a, b) => a.sort_date.localeCompare(b.sort_date));

  // Attendance lives in Planning Center Check-Ins, a separate product from
  // Services — only attempt it, and only for Plans whose service has already
  // happened (nothing to check people into yet for future Plans). Any
  // failure here (Check-Ins not enabled, token lacks access, etc.) is
  // reported as a warning and otherwise ignored — Plans still load fine.
  const now = Date.now();
  try {
    const { eventTimes, error } = await fetchCheckinEventTimes(headers, windowStart, now);
    if (error) warnings.push({ source: "check-ins", error });
    attachAttendance(plans, eventTimes, now);
  } catch (err) {
    warnings.push({ source: "check-ins", error: err.message });
  }

  return json({ plans, warnings });
}

// Pulls every Check-Ins "event time" (an actual occurrence of a recurring
// Check-Ins Event) that falls inside our window, along with its attendance
// count. Returns [] with an `error` string if Check-Ins isn't reachable or
// the token can't see it — callers should treat that as "no data available",
// not a hard failure.
async function fetchCheckinEventTimes(headers, windowStart, windowEnd) {
  let eventsRes;
  try {
    eventsRes = await fetch(`${CHECKINS_BASE}/events?per_page=100`, { headers });
  } catch (err) {
    return { eventTimes: [], error: "unreachable: " + err.message };
  }
  if (!eventsRes.ok) {
    return { eventTimes: [], error: `status ${eventsRes.status}` };
  }
  const eventsBody = await eventsRes.json();
  const events = eventsBody.data
    .map(e => ({ id: e.id, name: e.attributes.name }))
    .filter(e => !EXCLUDED_CHECKIN_EVENTS.some(ex => ex.toLowerCase() === e.name.toLowerCase()));

  const eventTimes = [];
  await Promise.all(events.map(async (ev) => {
    let timesRes;
    try {
      timesRes = await fetch(`${CHECKINS_BASE}/events/${ev.id}/event_times?order=-starts_at&per_page=25`, { headers });
    } catch (err) {
      return;
    }
    if (!timesRes.ok) return;
    const timesBody = await timesRes.json();
    const inWindow = timesBody.data
      .filter(t => t.attributes.starts_at)
      .filter(t => {
        const ts = new Date(t.attributes.starts_at).getTime();
        return ts >= windowStart && ts <= windowEnd;
      });

    await Promise.all(inWindow.map(async (t) => {
      const count = await fetchEventTimeAttendance(headers, t.id);
      if (count != null) {
        eventTimes.push({ starts_at: t.attributes.starts_at, count, event_name: ev.name });
      }
    }));
  }));

  return { eventTimes, error: null };
}

// Prefer explicit Headcounts (a manually-entered total per event time, e.g.
// for churches that don't scan individual check-ins) since that's the
// authoritative number when it exists. Otherwise fall back to counting
// individual check-in records for that event time via the list's total_count
// — cheap because per_page=1 still returns the full count in `meta`.
async function fetchEventTimeAttendance(headers, eventTimeId) {
  try {
    const hcRes = await fetch(`${CHECKINS_BASE}/event_times/${eventTimeId}/headcounts?per_page=100`, { headers });
    if (hcRes.ok) {
      const hcBody = await hcRes.json();
      if (hcBody.data && hcBody.data.length > 0) {
        return hcBody.data.reduce((sum, h) => sum + (h.attributes.total || 0), 0);
      }
    }
  } catch (err) {
    // fall through to check_ins count
  }
  try {
    const ciRes = await fetch(`${CHECKINS_BASE}/event_times/${eventTimeId}/check_ins?per_page=1`, { headers });
    if (ciRes.ok) {
      const ciBody = await ciRes.json();
      if (ciBody.meta && typeof ciBody.meta.total_count === "number") {
        return ciBody.meta.total_count;
      }
    }
  } catch (err) {
    // no attendance data available for this event time
  }
  return null;
}

// Matches each past Plan to any Check-Ins event times within
// ATTENDANCE_MATCH_WINDOW_MINUTES of its start, summing their counts (a
// service often has more than one relevant Check-Ins Event running at once,
// e.g. adults + kids). Sets `pco_attendance` on the Plan when a match exists;
// leaves it unset otherwise so the UI can fall back to manual entry.
function attachAttendance(plans, eventTimes, now) {
  const matchWindowMs = ATTENDANCE_MATCH_WINDOW_MINUTES * 60000;
  plans.forEach(p => {
    const planTime = new Date(p.sort_date).getTime();
    if (planTime > now) return;
    const matches = eventTimes.filter(t => Math.abs(new Date(t.starts_at).getTime() - planTime) <= matchWindowMs);
    if (matches.length > 0) {
      p.pco_attendance = matches.reduce((sum, m) => sum + m.count, 0);
    }
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
