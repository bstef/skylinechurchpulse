// Cloudflare Pages Function — aggregate org-wide Planning Center stats for
// the "Church Stats" page: Check-Ins attendance trends, People/membership
// counts, and Serving/volunteer scheduling. Deliberately does NOT touch
// Planning Center Giving — this app has no login, so anyone with the link
// sees whatever this endpoint returns, and financial data doesn't belong in
// that exposure model without real access control in front of it.
//
// Each section is fetched and reported independently (its own `error` field
// instead of failing the whole response) so a token that only has, say,
// Check-Ins access still gets a useful page instead of an all-or-nothing
// failure.

const PCO_SERVICES_BASE = "https://api.planningcenteronline.com/services/v2";
const PCO_PEOPLE_BASE = "https://api.planningcenteronline.com/people/v2";
const PCO_CHECKINS_BASE = "https://api.planningcenteronline.com/check-ins/v2";
const CHURCH_TIMEZONE = "America/New_York";

const CHECKINS_WINDOW_DAYS = 56; // ~8 weeks of trend
const NEW_PEOPLE_WINDOW_DAYS = 30;
const SERVING_WINDOW_DAYS_FUTURE = 21; // next 3 weeks of scheduling

function churchDateKey(iso) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: CHURCH_TIMEZONE }).format(new Date(iso));
  } catch (err) {
    return "";
  }
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

  const [checkins, people, serving] = await Promise.all([
    fetchCheckinsStats(headers),
    fetchPeopleStats(headers),
    fetchServingStats(headers),
  ]);

  return json({ checkins, people, serving });
}

// Reuses the same "sum regular_count + guest_count per event period" idea as
// pco-plans.js, but grouped by calendar day across every Check-Ins Event
// (not just ones matched to a Sunday Plan) to give an org-wide weekly trend.
async function fetchCheckinsStats(headers) {
  try {
    const eventsRes = await fetch(`${PCO_CHECKINS_BASE}/events?per_page=100`, { headers });
    if (!eventsRes.ok) return { error: { status: eventsRes.status } };
    const eventsBody = await eventsRes.json();
    const events = (eventsBody.data || []).filter(e => !e.attributes.archived_at);

    const windowStart = Date.now() - CHECKINS_WINDOW_DAYS * 86400000;

    const periodsPerEvent = await Promise.all(events.map(async (ev) => {
      let res;
      try {
        res = await fetch(`${PCO_CHECKINS_BASE}/events/${ev.id}/event_periods?order=-starts_at&per_page=25`, { headers });
      } catch (err) {
        return [];
      }
      if (!res.ok) return [];
      const body = await res.json();
      return (body.data || [])
        .filter(p => p.attributes.starts_at && new Date(p.attributes.starts_at).getTime() >= windowStart)
        .map(p => ({
          dateKey: churchDateKey(p.attributes.starts_at),
          regular: p.attributes.regular_count || 0,
          guest: p.attributes.guest_count || 0,
        }));
    }));

    const byDate = new Map();
    periodsPerEvent.flat().forEach(p => {
      const cur = byDate.get(p.dateKey) || { date: p.dateKey, regular: 0, guest: 0 };
      cur.regular += p.regular;
      cur.guest += p.guest;
      byDate.set(p.dateKey, cur);
    });

    const trend = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-8);

    return {
      trend: trend.map(d => ({ date: d.date, total: d.regular + d.guest })),
      total_regular: trend.reduce((s, d) => s + d.regular, 0),
      total_guest: trend.reduce((s, d) => s + d.guest, 0),
      error: null,
    };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

async function fetchPeopleStats(headers) {
  try {
    const cutoffIso = new Date(Date.now() - NEW_PEOPLE_WINDOW_DAYS * 86400000).toISOString();
    const [peopleRes, householdsRes, newRes] = await Promise.all([
      fetch(`${PCO_PEOPLE_BASE}/people?per_page=1&where[status]=active`, { headers }),
      fetch(`${PCO_PEOPLE_BASE}/households?per_page=1`, { headers }),
      fetch(`${PCO_PEOPLE_BASE}/people?per_page=1&where[created_at][gte]=${encodeURIComponent(cutoffIso)}`, { headers }),
    ]);
    if (!peopleRes.ok) return { error: { status: peopleRes.status } };

    const peopleBody = await peopleRes.json();
    const totalHouseholds = householdsRes.ok ? (await householdsRes.json()).meta?.total_count ?? null : null;
    const newPeople = newRes.ok ? (await newRes.json()).meta?.total_count ?? null : null;

    return {
      total_people: peopleBody.meta?.total_count ?? null,
      total_households: totalHouseholds,
      new_people: newPeople,
      error: null,
    };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

// Volunteer scheduling for the next few weeks — who's signed up, who hasn't
// confirmed, and who's carrying the most of the load. `where[sort_date]`
// range filtering + ascending order keeps this to exactly the plans in the
// window (no truncation risk from far-future plans crowding out near-term
// ones, unlike a plain "latest 25" fetch).
async function fetchServingStats(headers) {
  try {
    const typesRes = await fetch(`${PCO_SERVICES_BASE}/service_types?per_page=100`, { headers });
    if (!typesRes.ok) return { error: { status: typesRes.status } };
    const typesBody = await typesRes.json();
    const serviceTypes = (typesBody.data || []).map(t => ({ id: t.id, name: t.attributes.name }));

    const nowIso = new Date().toISOString();
    const windowEndIso = new Date(Date.now() + SERVING_WINDOW_DAYS_FUTURE * 86400000).toISOString();

    const plansPerType = await Promise.all(serviceTypes.map(async (st) => {
      let res;
      try {
        res = await fetch(
          `${PCO_SERVICES_BASE}/service_types/${st.id}/plans?where[sort_date][gte]=${encodeURIComponent(nowIso)}&where[sort_date][lte]=${encodeURIComponent(windowEndIso)}&order=sort_date&per_page=25`,
          { headers }
        );
      } catch (err) {
        return [];
      }
      if (!res.ok) return [];
      const body = await res.json();
      return (body.data || []).map(p => ({ service_type_id: st.id, plan_id: p.id }));
    }));
    const plans = plansPerType.flat();

    const teamMembersPerPlan = await Promise.all(plans.map(async (p) => {
      let res;
      try {
        res = await fetch(`${PCO_SERVICES_BASE}/service_types/${p.service_type_id}/plans/${p.plan_id}/team_members?per_page=100`, { headers });
      } catch (err) {
        return [];
      }
      if (!res.ok) return [];
      const body = await res.json();
      return (body.data || []).map(tm => ({
        name: tm.attributes.name || "Unknown",
        status: tm.attributes.status, // "C" confirmed, "U" unconfirmed, "D" declined
      }));
    }));
    const allSignups = teamMembersPerPlan.flat();

    const byName = new Map();
    let needsAttention = 0;
    allSignups.forEach(s => {
      if (s.status !== "C") needsAttention += 1;
      const cur = byName.get(s.name) || { name: s.name, count: 0 };
      cur.count += 1;
      byName.set(s.name, cur);
    });

    return {
      upcoming_plans: plans.length,
      volunteers_scheduled: byName.size,
      needs_attention: needsAttention,
      top_volunteers: [...byName.values()].sort((a, b) => b.count - a.count).slice(0, 5),
      error: null,
    };
  } catch (err) {
    return { error: { message: err.message } };
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
