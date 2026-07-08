// Cloudflare Pages Function — proxies Planning Center Services so the
// PCO Personal Access Token (PCO_APP_ID / PCO_SECRET) never reaches the browser.
// Configure both as Pages secrets (dashboard or `wrangler pages secret put`),
// and locally via a git-ignored `.dev.vars` file for `wrangler pages dev .`.

const PCO_BASE = "https://api.planningcenteronline.com/services/v2";
const WINDOW_DAYS_PAST = 14;
const WINDOW_DAYS_FUTURE = 45;

// Service Type folders that aren't worship/gathering events Pulse cares about
// (children's check-in, assimilation, etc.) — tune this list as your PCO org changes.
const EXCLUDED_SERVICE_TYPES = [
  "Check In, Baby Steps",
  "Little Steps, Handprints, Awana & Clubhouse Teams",
  "Assimilation",
  "First Impressions Teams Service Plan",
  "Childcare Services",
];

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
    return body.data
      .filter(p => p.attributes.sort_date)
      .map(p => ({
        id: p.id,
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
  }));

  const plans = plansPerType.flat().sort((a, b) => a.sort_date.localeCompare(b.sort_date));
  return json({ plans, warnings });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
