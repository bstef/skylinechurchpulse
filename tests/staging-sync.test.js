import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker,{refreshStaging,isRefreshTime,TABLES} from '../staging-sync/src/index.js';
function database(readOnly=false) {
  const sql=new DatabaseSync(':memory:');
  for(const file of readdirSync('migrations').sort())sql.exec(readFileSync('migrations/'+file,'utf8'));
  const queries=[];
  const db={prepare(query){
    if(readOnly && !query.startsWith('SELECT '))throw Error('Production mutation attempted');
    queries.push(query);
    return {query,params:[],bind(...params){return {...this,params};}};
  },async batch(statements){
    sql.exec('BEGIN');
    try {
      const result=statements.map(s=>{
        if(db.failInserts && s.query.startsWith('INSERT '))throw Error('Synthetic insert failure');
        return {success:true,results:sql.prepare(s.query).all(...s.params)};
      });
      sql.exec('COMMIT');return result;
    } catch(error){sql.exec('ROLLBACK');throw error;}
  },withSession(){return db;},getBookmark(){return 'test-recovery-bookmark';}};
  return {sql,db,queries};
}
function seed(sql,id,attendance=74) {
  sql.prepare('INSERT INTO service_entries (id,created_at,service_date,service_type,attendance,unity,engagement,loudness_db,notes) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id,'2026-10-19T18:45:42Z','2026-10-18','9:30 AM',attendance,4,3,76,"O’Brien's notes\nwith a second line");
}
test('nightly refresh preserves full production values, replaces test rows, and never mutates production',async()=>{
  const source=database(true),target=database();seed(source.sql,'real');seed(target.sql,'test',999);
  const sourceBefore=source.sql.prepare('SELECT * FROM service_entries').all();
  try {
    const env={SYNC_ENABLED:'true',PRODUCTION_DB:source.db,STAGING_DB:target.db};
    const result=await refreshStaging(env);
    assert.equal(result.status,'synced');assert.deepEqual(result.changedTables,['service_entries']);
    assert.deepEqual(target.sql.prepare('SELECT * FROM service_entries').all(),sourceBefore);
    assert.deepEqual(source.sql.prepare('SELECT * FROM service_entries').all(),sourceBefore);
    assert.ok(source.queries.every(q=>q.startsWith('SELECT ')));
    assert.deepEqual((await refreshStaging(env)).changedTables,[]);
    assert.equal((await worker.fetch(new Request('https://sync.test/run',{method:'POST'}),env)).status,404);
  } finally {source.sql.close();target.sql.close();}
});
test('schema drift, empty sources, disabled sync and insert failures preserve staging',async()=>{
  const source=database(true),target=database();seed(target.sql,'keep');
  const env={SYNC_ENABLED:'true',PRODUCTION_DB:source.db,STAGING_DB:target.db};
  try {
    await assert.rejects(refreshStaging(env),/Empty production/);
    seed(source.sql,'real');
    target.sql.exec('CREATE INDEX staging_only ON service_entries(attendance)');
    await assert.rejects(refreshStaging(env),/Schema mismatch/);
    target.sql.exec('DROP INDEX staging_only');
    target.db.failInserts=true;
    await assert.rejects(refreshStaging(env),/Synthetic insert failure/);
    assert.equal(target.sql.prepare('SELECT id FROM service_entries').get().id,'keep');
    assert.deepEqual(await refreshStaging({...env,SYNC_ENABLED:'false'}),{status:'disabled'});
    await assert.rejects(refreshStaging({...env,STAGING_DB:source.db}),/Separate database/);
  } finally {source.sql.close();target.sql.close();}
});
test('3am Eastern schedule runs once daily across DST and skipped triggers perform no database work',async()=>{
  for(const time of ['2026-07-01T07:00:00Z','2026-12-01T08:00:00Z','2026-11-01T08:00:00Z','2027-03-14T07:00:00Z'])assert.equal(isRefreshTime(Date.parse(time)),true);
  for(const time of ['2026-07-01T08:00:00Z','2026-12-01T07:00:00Z'])assert.equal(isRefreshTime(Date.parse(time)),false);
  await worker.scheduled({scheduledTime:Date.parse('2026-07-01T08:00:00Z')},{},{waitUntil(){assert.fail('Skipped trigger started work');}});
  assert.equal(TABLES.length,5);
});
