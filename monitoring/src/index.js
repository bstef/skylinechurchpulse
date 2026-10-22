// Aggregate analytics only: never queries application rows or exports SQL/parameters.
export const QUERY = `query PulseD1Metrics($account:string!,$db:string!,$start:Time!,$end:Time!,$storageStart:Time!){
  viewer { accounts(filter:{accountTag:$account}) {
    activity:d1AnalyticsAdaptiveGroups(limit:1,filter:{databaseId:$db,datetime_geq:$start,datetime_lt:$end}) {
      sum {readQueries writeQueries rowsRead rowsWritten}
      avg {queryBatchTimeMs}
      quantiles {queryBatchTimeMsP95}
    }
    storage:d1StorageAdaptiveGroups(limit:1,filter:{databaseId:$db,datetime_geq:$storageStart,datetime_lt:$end}) {
      max {databaseSizeBytes}
    }
  }}
}`;
const MINUTE = 60000;
export function configuration(env) {
  return ['CF_ANALYTICS_TOKEN','DD_API_KEY'].filter(key => !env[key]);
}
export function queryVariables(env, timestamp) {
  // Fifteen-minute rolling gauges tolerate analytics delays, overlap safely,
  // and never pretend to be additive, disjoint five-minute counters.
  const end = Math.floor(timestamp / (5 * MINUTE)) * 5 * MINUTE - 5 * MINUTE;
  return {account:env.CF_ACCOUNT_ID,db:env.D1_DATABASE_ID,
    start:new Date(end-15*MINUTE).toISOString(),end:new Date(end).toISOString(),
    storageStart:new Date(end-24*60*MINUTE).toISOString()};
}
export function metricSeries(env, account, timestamp) {
  if (!account || !Array.isArray(account.activity) || !Array.isArray(account.storage)) throw new Error('Unexpected analytics response');
  const tags = ['service:skyline-pulse','env:production',`database:${env.D1_DATABASE_NAME}`];
  const point = (name,value,unit) => {
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid analytics value');
    return {metric:`skyline.pulse.d1.${name}`,type:3,points:[{timestamp:Math.floor(timestamp/1000),value}],tags,...(unit?{unit}:{})};
  };
  const activity = account.activity[0];
  const sum = activity?.sum;
  if (activity && !sum) throw new Error('Missing query counts');
  const series = [point('collector_heartbeat',1)];
  for (const [name,key] of [['read_queries_15m','readQueries'],['write_queries_15m','writeQueries'],['rows_read_15m','rowsRead'],['rows_written_15m','rowsWritten']]) {
    // An empty successful aggregate is an idle window. Errors never reach here.
    series.push(point(name,activity ? sum[key] : 0));
  }
  if (activity) {
    if (activity.avg?.queryBatchTimeMs != null) series.push(point('latency_avg_ms',activity.avg.queryBatchTimeMs,'millisecond'));
    if (activity.quantiles?.queryBatchTimeMsP95 != null) series.push(point('latency_p95_ms',activity.quantiles.queryBatchTimeMsP95,'millisecond'));
  }
  if (account.storage[0]?.max?.databaseSizeBytes != null) series.push(point('storage_max_24h_bytes',account.storage[0].max.databaseSizeBytes,'byte'));
  return series;
}
export async function collect(env, timestamp = Date.now(), fetcher = fetch) {
  if (env.METRICS_ENABLED !== 'true') return {status:'disabled'};
  const missing = configuration(env);
  if (missing.length) return {status:'awaiting_secrets',missing};
  const variables = queryVariables(env,timestamp);
  const cloudflare = await fetcher('https://api.cloudflare.com/client/v4/graphql',{
    method:'POST',headers:{Authorization:`Bearer ${env.CF_ANALYTICS_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:QUERY,variables}),signal:AbortSignal.timeout(15000),
  });
  if (!cloudflare.ok) throw new Error(`Cloudflare analytics HTTP ${cloudflare.status}`);
  const result = await cloudflare.json();
  if (result.errors?.length) throw new Error('Cloudflare analytics rejected the query');
  const accounts = result.data?.viewer?.accounts;
  if (!Array.isArray(accounts) || accounts.length !== 1) throw new Error('Analytics account unavailable');
  const series = metricSeries(env,accounts[0],timestamp);
  // Fixed US1 destination matches the user's Datadog account; no URL from secrets.
  const datadog = await fetcher('https://api.datadoghq.com/api/v2/series',{
    method:'POST',headers:{'DD-API-KEY':env.DD_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({series}),signal:AbortSignal.timeout(15000),
  });
  if (!datadog.ok) throw new Error(`Datadog ingestion HTTP ${datadog.status}`);
  const accepted = await datadog.json();
  if (accepted.errors?.length) throw new Error('Datadog rejected metrics');
  return {status:'submitted',series:series.length,window: {from:variables.start,to:variables.end}};
}
export default {
  async scheduled(event,env,ctx) {
    ctx.waitUntil((async()=>{
      try {
        const result = await collect(env,event.scheduledTime);
        console.log(JSON.stringify({event:'d1_metrics_collection',...result}));
      } catch (error) {
        console.error(JSON.stringify({event:'d1_metrics_collection_failed',error:error.message}));
        throw error;
      }
    })());
  },
  async fetch(request,env) {
    if (new URL(request.url).pathname !== '/health' || request.method !== 'GET') return new Response('Not found',{status:404});
    const missing = configuration(env);
    return Response.json({service:'skyline-pulse-d1-metrics',enabled:env.METRICS_ENABLED==='true',configured:missing.length===0,missing},
      {status:missing.length?503:200,headers:{'Cache-Control':'no-store'}});
  },
};
