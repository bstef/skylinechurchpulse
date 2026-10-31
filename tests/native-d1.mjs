// Execute compiled Pages handlers inside workerd with native D1, without public HTTP.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
// Some sandboxed Linux hosts deny interface enumeration. This test-only fallback
// permits a loopback-only runtime; application/deployment code is unaffected.
try { os.networkInterfaces(); } catch {
 os.networkInterfaces=()=>({lo:[{address:'127.0.0.1',netmask:'255.0.0.0',family:'IPv4',mac:'00:00:00:00:00:00',internal:true,cidr:'127.0.0.1/8'}]});
 syncBuiltinESMExports();
}
const { Miniflare }=await import('miniflare');
const mf=new Miniflare({modules:true,scriptPath:'.wrangler/test-bundle/index.js',compatibilityDate:'2026-08-06',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{LOCAL_DEV:'true',EMAIL_ENABLED:'false'},host:'127.0.0.1',port:0,inspectorPort:0});
try {
 const db=await mf.getD1Database('DB');
 for(const file of readdirSync('migrations').sort()) for(const stmt of readFileSync('migrations/'+file,'utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean)) await db.prepare(stmt).run();
 const origin='http://localhost';
 const call=async(table,method='GET',body=null,id='')=>{
  const res=await mf.dispatchFetch(`${origin}/api/data/${table}${id?'/'+id:''}`,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:res.status,body:await res.json(),headers:res.headers};
 };
 const initial=await call('service_entries');assert.equal(initial.status,200);assert.deepEqual(initial.body.data,[]);assert.equal(initial.headers.get('Cache-Control'),'no-store');
 const record={service_date:'2026-10-18',service_type:'Special Event',attendance:1,unity:3,engagement:3,loudness_db:80,pco_plan_id:'d1-native-smoke',notes:'Synthetic test',sound_clarity:false};
 assert.equal((await call('service_entries','POST',record)).status,200);
 const rows=(await call('service_entries')).body.data;const id=rows[0].id;assert.equal(rows[0].sound_clarity,false);
 assert.equal((await call('service_entries','POST',record)).status,409);
 assert.equal((await call('service_entries','PATCH',{sound_clarity:true,notes:null},id)).status,200);
 assert.equal((await call('service_entries')).body.data[0].sound_clarity,true);
 assert.equal((await call('service_entries')).body.data[0].notes,null);
 assert.equal((await call('service_entries','DELETE',null,id)).status,200);
 assert.deepEqual((await call('service_entries')).body.data,[]);
 const denied=await mf.dispatchFetch(origin+'/api/data/service_entries',{method:'POST',headers:{Origin:'https://foreign.test','Content-Type':'application/json'},body:JSON.stringify(record)});assert.equal(denied.status,403);
 const noAuth=await mf.dispatchFetch('https://preview.test/api/data/service_entries');assert.equal(noAuth.status,401);
 const mobile=await mf.dispatchFetch(origin+'/api/mobile/data/service_entries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...record,pco_plan_id:'d1-native-mobile'})});assert.equal(mobile.status,200);
 assert.equal((await call('service_entries')).body.data[0].pco_plan_id,'d1-native-mobile');
 assert.equal((await mf.dispatchFetch('https://preview.test/api/mobile/data/service_entries')).status,401);
 assert.equal((await mf.dispatchFetch(origin+'/api/mobile/status')).status,200);
 const email=await mf.dispatchFetch(origin+'/api/send-report-email',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});assert.equal(email.status,403);
 assert.equal((await call('email_log')).status,200);
 for(const path of ['dist/exports','dist/node_modules','dist/migrations','dist/lib','dist/docs/D1-MIGRATION.md'])assert.equal(existsSync(path),false,'private file in static output: '+path);
 console.log('Native workerd/D1 checks passed: empty state, CRUD, duplicate constraints, booleans, nulls, CSRF, auth, disabled email, private build output.');
} finally {await mf.dispose();}
