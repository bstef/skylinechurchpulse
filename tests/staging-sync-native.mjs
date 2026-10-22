import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import {refreshStaging} from '../staging-sync/src/index.js';
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-08-06',d1Databases:['PRODUCTION_DB','STAGING_DB'],host:'127.0.0.1',port:0,inspectorPort:0});
try {
 const source=await mf.getD1Database('PRODUCTION_DB'),target=await mf.getD1Database('STAGING_DB');
 for(const db of [source,target])for(const file of readdirSync('migrations').sort())for(const statement of readFileSync('migrations/'+file,'utf8').replace(/^--.*$/gm,'').split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
 const seed=(db,id)=>db.prepare('INSERT INTO service_entries (id,created_at,service_date,service_type,attendance,unity,engagement,loudness_db,notes) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,'2026-10-19T18:45:42Z','2026-10-18','9:30 AM',74,4,3,76,"O'Brien\nUnicode: ✓").run();
 await seed(source,'real');await seed(target,'test');
 const env={SYNC_ENABLED:'true',PRODUCTION_DB:source,STAGING_DB:target};
 assert.deepEqual((await refreshStaging(env)).changedTables,['service_entries']);
 assert.deepEqual((await target.prepare('SELECT * FROM service_entries').all()).results,(await source.prepare('SELECT * FROM service_entries').all()).results);
 assert.deepEqual((await refreshStaging(env)).changedTables,[]);
 await target.prepare('UPDATE service_entries SET attendance=999').run();
 for(const db of [source,target])await db.prepare("CREATE TRIGGER fail_insert BEFORE INSERT ON service_entries BEGIN SELECT RAISE(ABORT,'Synthetic insert failure'); END").run();
 await assert.rejects(refreshStaging(env),/Synthetic insert failure/);
 assert.equal((await target.prepare('SELECT attendance FROM service_entries').first()).attendance,999);
 assert.equal((await source.prepare('SELECT attendance FROM service_entries').first()).attendance,74);
 console.log('Native D1 staging refresh passed: exact values, JSON inserts, recovery bookmark, idempotence, and transactional rollback.');
} finally {await mf.dispose();}
