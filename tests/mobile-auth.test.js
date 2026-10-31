import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import * as browserData from '../functions/api/data/[[path]].js';
import * as mobileData from '../functions/api/mobile/data/[[path]].js';
import * as browserPlans from '../functions/api/pco-plans.js';
import * as mobilePlans from '../functions/api/mobile/pco-plans.js';
import * as browserStats from '../functions/api/pco-stats.js';
import * as mobileStats from '../functions/api/mobile/pco-stats.js';
import * as browserStatus from '../functions/api/status.js';
import * as mobileStatus from '../functions/api/mobile/status.js';
import { onRequestPost as browserReport } from '../functions/api/send-report-email.js';
import { onRequestPost as mobileReport } from '../functions/api/mobile/send-report-email.js';
const team='peacockengr.cloudflareaccess.com';
const clientId='mobile-client';
const mobileIssuer=`https://${team}/cdn-cgi/access/sso/oidc/${clientId}`;
const env={ACCESS_TEAM_DOMAIN:team,ACCESS_AUD:'browser-aud',ACCESS_MOBILE_CLIENT_ID:clientId};
const {publicKey,privateKey}=await generateKeyPair('RS256');
const jwk={...await exportJWK(publicKey),kid:'test',alg:'RS256',use:'sig'};
const sign=({aud=clientId,iss=mobileIssuer,exp='1h'}={})=>new SignJWT({email:'volunteer@example.com'}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(iss).setAudience(aud).setSubject('test-user').setIssuedAt().setExpirationTime(exp).sign(privateKey);
// Serve the test key set from both Access key endpoints; any other network call fails the test.
async function withKeys(fn) {
  const realFetch=globalThis.fetch;const fetched=[];
  globalThis.fetch=async url=>{
    const href=String(url);fetched.push(href);
    if([`${mobileIssuer}/jwks`,`https://${team}/cdn-cgi/access/certs`].includes(href))return Response.json({keys:[jwk]});
    throw new Error('Unexpected network call: '+href);
  };
  try {return await fn(fetched);} finally {globalThis.fetch=realFetch;}
}
async function call(path,{headers={},method='GET',config=env}={}) {
  let called=false;
  const response=await middleware({request:new Request('https://skylinechurch.tech'+path,{method,headers}),env:config,next:async()=>{called=true;return Response.json({data:[]});}});
  return {status:response.status,called,response};
}
const bearer=token=>({Authorization:'Bearer '+token});
test('mobile routes accept a valid OIDC bearer token, including writes without an Origin',async()=>withKeys(async fetched=>{
  const token=await sign();
  const read=await call('/api/mobile/data/service_entries',{headers:bearer(token)});
  assert.equal(read.status,200);assert.equal(read.called,true);assert.equal(read.response.headers.get('Cache-Control'),'no-store');
  const write=await call('/api/mobile/data/service_entries',{method:'POST',headers:bearer(token)});
  assert.equal(write.status,200);assert.equal(write.called,true);
  assert.ok(fetched.every(url=>url===`${mobileIssuer}/jwks`));
}));
test('mobile routes reject missing, malformed, expired and mis-addressed tokens before the handler runs',async()=>withKeys(async()=>{
  const browserToken=await sign({aud:'browser-aud',iss:`https://${team}`});
  const cases=[
    {},
    {headers:{Authorization:'Basic dXNlcjpwYXNz'}},
    {headers:{Authorization:'Bearer not-a-jwt'}},
    {headers:bearer(await sign({exp:'-1s'}))},
    {headers:bearer(await sign({aud:'another-client'}))},
    {headers:bearer(await sign({iss:'https://attacker.cloudflareaccess.com/cdn-cgi/access/sso/oidc/'+clientId}))},
    // A browser Access assertion is not a mobile credential, in either header.
    {headers:bearer(browserToken)},
    {headers:{'Cf-Access-Jwt-Assertion':browserToken}},
  ];
  for(const options of cases){const result=await call('/api/mobile/data/service_entries',options);assert.equal(result.status,401);assert.equal(result.called,false);}
  const token=await sign();const parts=token.split('.');
  parts[1]=Buffer.from(JSON.stringify({sub:'forged',aud:clientId,iss:mobileIssuer,exp:9999999999,iat:1})).toString('base64url');
  assert.equal((await call('/api/mobile/data/service_entries',{headers:bearer(parts.join('.'))})).status,401);
}));
test('mobile sign-in fails closed when it is not configured',async()=>withKeys(async()=>{
  const token=await sign();
  for(const config of [{ACCESS_TEAM_DOMAIN:team},{...env,ACCESS_MOBILE_CLIENT_ID:'../certs?x='},{...env,ACCESS_TEAM_DOMAIN:'evil.example.com'}]){
    const result=await call('/api/mobile/data/service_entries',{headers:bearer(token),config});
    assert.equal(result.status,401);assert.equal(result.called,false);
  }
}));
test('browser routes keep requiring the Access assertion and same-origin writes',async()=>withKeys(async()=>{
  const mobileToken=await sign();
  assert.equal((await call('/api/data/service_entries',{headers:bearer(mobileToken)})).status,401);
  const assertion={'Cf-Access-Jwt-Assertion':await sign({aud:'browser-aud',iss:`https://${team}`})};
  assert.equal((await call('/api/data/service_entries',{headers:assertion})).status,200);
  assert.equal((await call('/api/data/service_entries',{method:'POST',headers:assertion})).status,403);
  assert.equal((await call('/api/data/service_entries',{method:'POST',headers:{...assertion,Origin:'https://skylinechurch.tech'}})).status,200);
}));
test('mobile routes reuse the browser handlers and leave out the debug endpoint',()=>{
  assert.equal(mobileData.onRequest,browserData.onRequest);
  assert.equal(mobilePlans.onRequestGet,browserPlans.onRequestGet);
  assert.equal(mobileStats.onRequestGet,browserStats.onRequestGet);
  assert.equal(mobileStatus.onRequestGet,browserStatus.onRequestGet);
  assert.equal(existsSync(new URL('../functions/api/mobile/pco-checkins-debug.js',import.meta.url)),false);
});
test('only the browser report route requires a same-origin request',async()=>{
  const realFetch=globalThis.fetch;let sends=0;
  globalThis.fetch=async url=>{assert.equal(url,'https://api.resend.com/emails');sends++;return Response.json({id:'mock'});};
  const DB={prepare(query){return {bind(){return {async all(){return {results:query.includes('email_recipients')?[{email:'test@example.com'}]:[]};},async run(){return {meta:{changes:1}};}};}};}};
  const reportEnv={EMAIL_ENABLED:'true',CF_PAGES_BRANCH:'main',RESEND_API_KEY:'test-key',DB};
  const request=()=>new Request('https://skylinechurch.tech/api/send-report-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dataset:'services',filename:'report.pdf',contentBase64:'JVBERi0=',contentType:'application/pdf'})});
  try {
    assert.equal((await browserReport({request:request(),env:reportEnv})).status,403);
    assert.equal(sends,0);
    assert.equal((await mobileReport({request:request(),env:reportEnv})).status,200);
    assert.equal(sends,1);
    assert.equal((await mobileReport({request:request(),env:{...reportEnv,EMAIL_ENABLED:'false'}})).status,403);
  } finally {globalThis.fetch=realFetch;}
});
