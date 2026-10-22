import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{collect,metricSeries,queryVariables} from '../monitoring/src/index.js';
const env={METRICS_ENABLED:'true',CF_ACCOUNT_ID:'account',D1_DATABASE_ID:'database',D1_DATABASE_NAME:'skyline-pulse-production',CF_ANALYTICS_TOKEN:'cloudflare-test-secret',DD_API_KEY:'datadog-test-secret'};
const now=Date.parse('2026-10-22T13:27:00Z');
const data={activity:[{sum:{readQueries:5,writeQueries:1,rowsRead:100,rowsWritten:2},avg:{queryBatchTimeMs:0.4},quantiles:{queryBatchTimeMsP95:1.2}}],storage:[{max:{databaseSizeBytes:98304}}]};
test('collector submits verified aggregates as rolling gauges without application contents',async()=>{
  const calls=[];
  const result=await collect(env,now,async(url,options)=>{
    calls.push({url,...options});
    if(calls.length===1)return Response.json({data:{viewer:{accounts:[data]}}});
    return Response.json({errors:[]},{status:202});
  });
  assert.equal(result.status,'submitted');assert.equal(result.series,8);
  const query=JSON.parse(calls[0].body);assert.equal(query.variables.start,'2026-10-22T13:05:00.000Z');assert.equal(query.variables.end,'2026-10-22T13:20:00.000Z');
  assert.equal(calls[0].headers.Authorization,'Bearer cloudflare-test-secret');
  assert.equal(calls[1].headers['DD-API-KEY'],'datadog-test-secret');
  const payload=JSON.parse(calls[1].body);assert.ok(payload.series.every(s=>s.type===3));
  assert.equal(payload.series.find(s=>s.metric.endsWith('rows_read_15m')).points[0].value,100);
  assert.equal(payload.series.find(s=>s.metric.endsWith('latency_p95_ms')).points[0].value,1.2);
  assert.ok(!calls[1].body.includes('cloudflare-test-secret'));
  assert.ok(!calls[1].body.includes('SELECT'));
});
test('collector refuses misleading zeros on API, permission and schema failures',async()=>{
  for(const response of [()=>Response.json({},{status:403}),()=>Response.json({errors:[{message:'denied'}]}),()=>Response.json({data:{viewer:{accounts:[]}}}),()=>Response.json({data:{viewer:{accounts:[{}]}}})]){
    let calls=0;await assert.rejects(collect(env,now,async()=>{calls++;return response();}));assert.equal(calls,1);
  }
  assert.throws(()=>metricSeries(env,{activity:[{sum:{readQueries:NaN}}],storage:[]},now));
});
test('idle windows omit unavailable latency and storage; no keys means no network',async()=>{
  const idle=metricSeries(env,{activity:[],storage:[]},now);
  assert.equal(idle.length,5);assert.ok(!idle.some(s=>s.metric.includes('latency')));
  const noNetwork=()=>{throw new Error('Unexpected request');};
  assert.equal((await collect({...env,DD_API_KEY:''},now,noNetwork)).status,'awaiting_secrets');
  assert.equal((await collect({...env,METRICS_ENABLED:'false'},now,noNetwork)).status,'disabled');
  const health=await worker.fetch(new Request('https://metrics.test/health'),{METRICS_ENABLED:'true'});
  assert.equal(health.status,503);assert.equal((await health.json()).configured,false);
  assert.equal((await worker.fetch(new Request('https://metrics.test/collect',{method:'POST'}),env)).status,404);
});
test('Datadog errors fail the run instead of claiming delivery',async()=>{
  for(const rejected of [()=>Response.json({},{status:403}),()=>Response.json({errors:['invalid metric']},{status:202})]){
    let count=0;await assert.rejects(collect(env,now,async()=>++count===1?Response.json({data:{viewer:{accounts:[data]}}}):rejected()));
  }
  assert.equal(queryVariables(env,now).storageStart,'2026-10-21T13:20:00.000Z');
});
