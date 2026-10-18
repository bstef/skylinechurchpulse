import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { verifyAccessToken } from '../lib/access.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { onRequestPost } from '../functions/api/send-report-email.js';
import digest, { sendDigest } from '../cron-worker/src/index.js';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
const issuer='https://peacockengr.cloudflareaccess.com';
test('signed JWT accepts only matching audience, issuer, expiry and signature',async()=>{
  const {publicKey,privateKey}=await generateKeyPair('RS256');
  const jwk=await exportJWK(publicKey);jwk.kid='test';
  const keys=createLocalJWKSet({keys:[jwk]});
  const sign=(aud='pulse',iss=issuer,exp='1h')=>new SignJWT({}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer(iss).setAudience(aud).setSubject('test-user').setIssuedAt().setExpirationTime(exp).sign(privateKey);
  const token=await sign();
  await verifyAccessToken(token,keys,issuer,'pulse');
  await assert.rejects(verifyAccessToken(await sign('other'),keys,issuer,'pulse'));
  await assert.rejects(verifyAccessToken(await sign('pulse','https://wrong.test'),keys,issuer,'pulse'));
  await assert.rejects(verifyAccessToken(await sign('pulse',issuer,'-1s'),keys,issuer,'pulse'));
  const parts=token.split('.');parts[1]=Buffer.from(JSON.stringify({sub:'forged',aud:'pulse',iss:issuer,exp:9999999999,iat:1})).toString('base64url');
  await assert.rejects(verifyAccessToken(parts.join('.'),keys,issuer,'pulse'));
});
test('middleware blocks APIs before accessing DB or PCO and marks private responses no-store',async()=>{
  let called=false;
  const next=async()=>{called=true;return Response.json({data:[]});};
  const denied=await middleware({request:new Request('https://preview.pages.dev/api/pco-stats'),env:{},next});
  assert.equal(denied.status,401);assert.equal(called,false);
  const allowed=await middleware({request:new Request('http://localhost:8788/api/data/service_entries'),env:{LOCAL_DEV:'true'},next});
  assert.equal(allowed.headers.get('Cache-Control'),'no-store');assert.equal(called,true);
});
function dbSetup() {
  const sql=new DatabaseSync(':memory:');for (const file of readdirSync(new URL('../migrations/',import.meta.url)).sort()) sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const DB={prepare(query){return {bind(...params){return {async all(){return {results:sql.prepare(query).all(...params)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...params).changes)}};}};}};}};
  return {sql,DB};
}
const payload={dataset:'services',filename:'report.pdf',contentBase64:'JVBERi0=',contentType:'application/pdf'};
const reportRequest=()=>new Request('https://skylinechurch.tech/api/send-report-email',{method:'POST',headers:{Origin:'https://skylinechurch.tech','Content-Type':'application/json'},body:JSON.stringify(payload)});
test('preview report and digest never send, even if a key is present',async()=>{
  const realFetch=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Unexpected network call');};
  try {
    assert.equal((await onRequestPost({request:reportRequest(),env:{EMAIL_ENABLED:'false',RESEND_API_KEY:'fake'}})).status,403);
    assert.equal((await onRequestPost({request:reportRequest(),env:{EMAIL_ENABLED:'true',CF_PAGES_BRANCH:'feat/d1-migration',RESEND_API_KEY:'fake'}})).status,403);
    assert.equal((await sendDigest({EMAIL_ENABLED:'false',RESEND_API_KEY:'fake'})).sent_to,0);
    assert.equal((await digest.fetch(new Request('https://digest.test',{method:'POST'}),{})).status,401);
  } finally {globalThis.fetch=realFetch;}
});
test('report uses D1 recipients and archives success/failure without real email',async()=>{
  const {sql,DB}=dbSetup();sql.prepare('INSERT INTO email_recipients(id,email) VALUES (?,?)').run('test','test@example.com');
  const realFetch=globalThis.fetch;
  const env={EMAIL_ENABLED:'true',CF_PAGES_BRANCH:'main',RESEND_API_KEY:'test-key',DB};
  try {
    globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');const body=JSON.parse(options.body);assert.deepEqual(body.to,['test@example.com']);return Response.json({id:'mock'});};
    assert.equal((await onRequestPost({request:reportRequest(),env})).status,200);
    assert.equal(sql.prepare('SELECT status FROM email_log').get().status,'sent');
    globalThis.fetch=async()=>Response.json({message:'mock rejected'},{status:422});
    assert.equal((await onRequestPost({request:reportRequest(),env})).status,422);
    assert.equal(sql.prepare("SELECT count(*) n FROM email_log WHERE status='failed'").get().n,1);
  } finally {globalThis.fetch=realFetch;sql.close();}
});
test('weekly digest uses D1 data and prunes only expired logs (network stubbed)',async()=>{
  const {sql,DB}=dbSetup();sql.prepare('INSERT INTO email_recipients(id,email) VALUES (?,?)').run('test','test@example.com');
  sql.prepare("INSERT INTO email_log(id,kind,subject,status,sent_at) VALUES ('old','report','old','sent','2020-01-01T00:00:00Z')").run();
  const realFetch=globalThis.fetch;
  try {
    globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');assert.match(JSON.parse(options.body).html,/Sunday Services/);return Response.json({id:'mock'});};
    assert.equal((await sendDigest({EMAIL_ENABLED:'true',RESEND_API_KEY:'test',DB})).sent_to,1);
    assert.equal(sql.prepare('SELECT count(*) n FROM email_log').get().n,1);
    assert.equal(sql.prepare('SELECT kind FROM email_log').get().kind,'weekly_digest');
  } finally {globalThis.fetch=realFetch;sql.close();}
});
