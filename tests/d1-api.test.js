import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { onRequest } from '../functions/api/data/[[path]].js';
import { authorize, sameOriginWrite } from '../lib/access.js';
import { allRows } from '../lib/d1-store.js';
function database() {
  const sql = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../migrations/',import.meta.url)).sort()) sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  // Real SQLite execution; only adapt the asynchronous D1 interface.
  const db = { prepare(query) { return { bind(...params) { return {
    async all() { return { results:sql.prepare(query).all(...params) }; },
    async run() { const r=sql.prepare(query).run(...params); return { meta:{changes:Number(r.changes)} }; },
  }; } }; } };
  return {sql,db};
}
function request(db,table,method='GET',body=null,id=null) {
  return onRequest({env:{DB:db},params:{path:[table,...(id?[id]:[])]},request:new Request('https://pulse.test/api/data/'+table,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})})});
}
const entry={service_date:'2026-10-11',service_type:'9:30 AM',attendance:200,unity:4,engagement:4,loudness_db:90,sound_clarity:false,notes:"O'Brien",pco_plan_id:'plan1'};
test('cutover maintenance permits reads but prevents mutations',async()=>{
  const {db,sql}=database();
  const call=method=>onRequest({env:{DB:db,WRITES_ENABLED:'false'},params:{path:['service_entries']},request:new Request('https://pulse.test/api/data/service_entries',{method})});
  assert.equal((await call('GET')).status,200);
  for(const method of ['POST','PATCH','DELETE']) assert.equal((await call(method)).status,503);
  assert.equal(sql.prepare('SELECT count(*) n FROM service_entries').get().n,0);
  sql.close();
});
test('service CRUD preserves boolean values and enforces uniqueness',async()=>{
  const {db,sql}=database();
  assert.equal((await request(db,'service_entries','POST',entry)).status,200);
  const rows=(await (await request(db,'service_entries')).json()).data;
  assert.equal(rows.length,1); assert.equal(rows[0].sound_clarity,false); assert.equal(rows[0].lighting_fit,true); assert.equal(rows[0].notes,"O'Brien");
  assert.equal((await request(db,'service_entries','POST',entry)).status,409);
  assert.equal((await request(db,'service_entries','POST',{...entry,service_type:'11:00 AM'})).status,200);
  assert.equal((await request(db,'service_entries','PATCH',{sound_clarity:true},rows[0].id)).status,200);
  assert.equal((await allRows(db,'service_entries')).find(r=>r.id===rows[0].id).sound_clarity,true);
  assert.equal((await request(db,'service_entries','DELETE',null,rows[0].id)).status,200);
  assert.equal((await request(db,'service_entries','DELETE',null,rows[0].id)).status,404);
  sql.close();
});
test('invalid values, arbitrary tables/columns, and log writes are rejected',async()=>{
  const {db,sql}=database();
  for(const payload of [{...entry,unity:6},{...entry,sound_clarity:'false'},{...entry,created_at:'yesterday'},{...entry,service_date:'2026-02-30'},{...entry,attendance:null}]) assert.equal((await request(db,'service_entries','POST',payload)).status,400);
  assert.equal((await request(db,'service_entries; DROP TABLE email_log')).status,404);
  assert.equal((await request(db,'email_log','POST',{subject:'forged'})).status,405);
  assert.equal((await request(db,'email_recipients','POST',{email:'person@example.com'})).status,200);
  assert.equal((await request(db,'email_recipients','POST',{email:'person@example.com'})).status,409);
  sql.close();
});
test('pagination loads beyond 500 rows with deterministic ordering',async()=>{
  const {db,sql}=database();
  const insert=sql.prepare('INSERT INTO email_recipients(id,email) VALUES (?,?)');
  for(let i=0;i<501;i++) insert.run(String(i).padStart(5,'0'),`person${i}@example.com`);
  assert.equal((await allRows(db,'email_recipients')).length,501);
  const body=await (await request(db,'email_recipients')).json();
  assert.equal(body.data.length,500); assert.equal(body.nextOffset,500);
  sql.close();
});
test('auth fails closed, localhost bypass cannot expose a deployed preview, writes require same origin',async()=>{
  await assert.rejects(authorize(new Request('https://preview.pages.dev/api/data/service_entries'),{}));
  await assert.rejects(authorize(new Request('https://preview.pages.dev/api/data/service_entries'),{LOCAL_DEV:'true'}));
  await authorize(new Request('http://localhost:8788/api/data/service_entries'),{LOCAL_DEV:'true'});
  await assert.rejects(authorize(new Request('https://preview.pages.dev/api/data/service_entries'),{ACCESS_TEAM_DOMAIN:'peacockengr.cloudflareaccess.com',ACCESS_AUD:'test'}));
  assert.equal(sameOriginWrite(new Request('https://pulse.test/api/data/service_entries',{method:'POST',headers:{Origin:'https://evil.test'}})),false);
  assert.equal(sameOriginWrite(new Request('https://pulse.test/api/data/service_entries',{method:'POST',headers:{Origin:'https://pulse.test'}})),true);
});
