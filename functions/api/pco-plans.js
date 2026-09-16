// Cloudflare Pages Function — proxies Planning Center Services so the
// PCO Personal Access Token (PCO_APP_ID / PCO_SECRET) never reaches the browser.
// Configure both as Pages secrets (dashboard or `wrangler pages secret put`),
// and locally via a git-ignored `.dev.vars` file for `wrangler pages dev .`.

const PCO_BASE = "https://api.planningcenteronline.com/services/v2";
const CHECKINS_BASE = "https://api.planningcenteronline.com/check-ins/v2";
const WINDOW_DAYS_PAST = 14;
const WINDOW_DAYS_PAST_MAX = 120; // "Load older services" caps out around 4 months back
const WINDOW_DAYS_FUTURE = 45;
const CHURCH_TIMEZONE = "America/New_York";

// A wider window (from "Load older services") means more Plans/periods fall
// inside it, each needing its own artwork/event-time sub-fetch — bound both
// regardless of window size so a large org can't blow past Cloudflare Pages
// Functions' per-invocation subrequest limit on an otherwise-ordinary click.
const MAX_ARTWORK_PROBES = 80;
const MAX_EVENT_TIME_PROBES = 80;

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

// Calendar day (YYYY-MM-DD) in the church's own timezone, so a Saturday-night
// UTC rollover doesn't shift a plan onto the wrong day when matching against
// Check-Ins event periods.
function churchDateKey(iso) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: CHURCH_TIMEZONE }).format(new Date(iso));
  } catch (err) {
    return "";
  }
}

function normalizeWords(s) {
  return new Set((s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean));
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

// A Check-Ins "event period" is roughly one calendar occurrence of a
// Check-Ins Event (usually a whole day/weekend) and reports a single
// combined regular_count/guest_count for it — so a church running 9:30 and
// 11:00 under one combined Check-Ins Event would get the same whole-day
// number matched to both Plans. Each period nests "event times" for the
// actual individual services within it (each with its own counts), so this
// fetches those per period and only falls back to the period's combined
// total when no per-service breakdown is available. Prefers total_count
// when Check-Ins reports one, since — unlike regular_count + guest_count —
// it also picks up volunteers and any custom Headcount categories a church
// has configured beyond the standard Regular/Guest/Volunteer types.
//
// There's no plan_id on either side to join on, so this then matches each
// candidate to a Services Plan by same-day date plus best-effort name/time
// similarity (see matchPcoAttendance). It's a suggestion, not ground truth
// — the log form always lets you override it.
function attendanceTotal(attrs) {
  if (typeof attrs.total_count === "number") return attrs.total_count;
  return (attrs.regular_count || 0) + (attrs.guest_count || 0) + (attrs.volunteer_count || 0);
}

async function fetchCheckinsPeriods(headers, windowStart, windowEnd, periodsPerPage) {
  const probeBudget = { remaining: MAX_EVENT_TIME_PROBES };
  let eventsRes;
  try {
    eventsRes = await fetch(`${CHECKINS_BASE}/events?per_page=100`, { headers });
  } catch (err) {
    return { periods: [], warning: { source: "check-ins", error: err.message } };
  }
  if (!eventsRes.ok) {
    // Check-Ins may not be enabled for this org/token — degrade quietly.
    return { periods: [], warning: { source: "check-ins", status: eventsRes.status } };
  }
  const eventsBody = await eventsRes.json();
  const events = (eventsBody.data || [])
    .filter(e => !e.attributes.archived_at)
    .map(e => ({ id: e.id, name: e.attributes.name || "" }));

  const periodsPerEvent = await Promise.all(events.map(async (ev) => {
    let res;
    try {
      res = await fetch(`${CHECKINS_BASE}/events/${ev.id}/event_periods?order=-starts_at&per_page=${periodsPerPage}`, { headers });
    } catch (err) {
      return [];
    }
    if (!res.ok) return [];
    const body = await res.json();
    const periodsInWindow = (body.data || [])
      .filter(p => p.attributes.starts_at)
      .filter(p => {
        const t = new Date(p.attributes.starts_at).getTime();
        return t >= windowStart && t <= windowEnd;
      });

    const candidatesPerPeriod = await Promise.all(periodsInWindow.map(async (period) => {
      let times = [];
      if (probeBudget.remaining > 0) {
        probeBudget.remaining -= 1;
        let timesRes;
        try {
          timesRes = await fetch(`${CHECKINS_BASE}/events/${ev.id}/event_periods/${period.id}/event_times?per_page=25`, { headers });
        } catch (err) {
          timesRes = null;
        }
        times = timesRes && timesRes.ok ? ((await timesRes.json()).data || []) : [];
      }
      const timesWithStart = times.filter(t => t.attributes.starts_at);

      if (timesWithStart.length > 0) {
        return timesWithStart.map(t => ({
          eventName: [ev.name, t.attributes.name].filter(Boolean).join(" "),
          startsAt: t.attributes.starts_at,
          dateKey: churchDateKey(t.attributes.starts_at),
          attendance: attendanceTotal(t.attributes),
        }));
      }
      // No per-service breakdown available (or the org doesn't use event
      // times) — fall back to the period's own combined total.
      return [{
        eventName: ev.name,
        startsAt: period.attributes.starts_at,
        dateKey: churchDateKey(period.attributes.starts_at),
        attendance: attendanceTotal(period.attributes),
      }];
    }));

    return candidatesPerPeriod.flat();
  }));

  return { periods: periodsPerEvent.flat(), warning: null };
}

function matchPcoAttendance(plan, periods) {
  const candidates = periods.filter(p => p.dateKey === churchDateKey(plan.sort_date));
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].attendance;

  const planWords = normalizeWords([plan.service_type_name, plan.plan_time_name, plan.title].filter(Boolean).join(" "));
  const planTime = new Date(plan.sort_date).getTime();
  let best = null;
  let bestScore = -1;
  let bestTimeDiff = Infinity;
  for (const c of candidates) {
    const eventWords = normalizeWords(c.eventName);
    let overlap = 0;
    eventWords.forEach(w => { if (planWords.has(w)) overlap += 1; });
    const timeDiff = Math.abs(new Date(c.startsAt).getTime() - planTime);
    if (overlap > bestScore || (overlap === bestScore && timeDiff < bestTimeDiff)) {
      best = c;
      bestScore = overlap;
      bestTimeDiff = timeDiff;
    }
  }
  return best ? best.attendance : null;
}

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

  const url = new URL(context.request.url);
  const requestedDaysPast = Number(url.searchParams.get("days_past")) || WINDOW_DAYS_PAST;
  const daysPast = Math.min(Math.max(requestedDaysPast, WINDOW_DAYS_PAST), WINDOW_DAYS_PAST_MAX);

  const windowStart = Date.now() - daysPast * 86400000;
  const windowEnd = Date.now() + WINDOW_DAYS_FUTURE * 86400000;
  const warnings = [];

  // Fixed at PCO's practical per_page ceiling rather than sized from the
  // requested window: results come back newest-first, so if a service
  // type/Check-Ins event has entries dated past the window's far end (e.g.
  // a year of auto-generated future Plans), a window-sized page could be
  // entirely consumed by those before ever reaching the window we
  // actually want — silently dropping history while claiming the full
  // requested range was searched.
  const checkinsPromise = fetchCheckinsPeriods(headers, windowStart, windowEnd, 100);
  const artworkBudget = { remaining: MAX_ARTWORK_PROBES };

  const plansPerType = await Promise.all(serviceTypes.map(async (st) => {
    let res;
    try {
      res = await fetch(`${PCO_BASE}/service_types/${st.id}/plans?order=-sort_date&per_page=100`, { headers });
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

    // Pull the sermon/series artwork for each plan, if any is attached —
    // bounded by a shared budget across all service types (see
    // MAX_ARTWORK_PROBES) so a wide "Load older services" window can't
    // balloon this into hundreds of subrequests. Plans beyond the budget
    // just render without artwork.
    await Promise.all(rawPlans.map(async (plan) => {
      if (artworkBudget.remaining <= 0) return;
      artworkBudget.remaining -= 1;
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

  const { periods: checkinsPeriods, warning: checkinsWarning } = await checkinsPromise;
  if (checkinsWarning) warnings.push(checkinsWarning);
  plans.forEach(p => { p.attendance_from_pco = matchPcoAttendance(p, checkinsPeriods); });

  return json({ plans, warnings, days_past: daysPast, days_past_max: WINDOW_DAYS_PAST_MAX });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
