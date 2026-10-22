// One-way refresh: production is only read; every mutation targets staging.
export const TABLES = ['service_entries','production_entries','email_recipients','email_log','host_entries'];
const MAX_ROWS = 10000;
const MAX_BYTES = 1024 * 1024;
const canonical = rows => JSON.stringify(rows.map(row => Object.fromEntries(Object.keys(row).sort().map(key => [key,row[key]]))));
const identifier = name => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Unexpected schema identifier');
  return `"${name}"`;
};
export function isRefreshTime(timestamp) {
  return new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(new Date(timestamp)) === '03';
}
async function snapshot(db) {
  const queries = TABLES.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id LIMIT ${MAX_ROWS + 1}`));
  queries.push(db.prepare(`SELECT name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') AND tbl_name IN (${TABLES.map(() => '?').join(',')}) ORDER BY type,name`).bind(...TABLES));
  const result = await db.batch(queries);
  if (result.some(item => !item.success || !Array.isArray(item.results))) throw new Error('Snapshot query failed');
  if (result.slice(0,TABLES.length).some(item => item.results.length > MAX_ROWS)) throw new Error('Snapshot row safety limit exceeded');
  if (new TextEncoder().encode(JSON.stringify(result.map(item => item.results))).byteLength > MAX_BYTES) throw new Error('Snapshot size safety limit exceeded');
  return {tables:result.slice(0,TABLES.length).map(item => item.results),schema:result[TABLES.length].results};
}
export async function refreshStaging(env) {
  if (env.SYNC_ENABLED !== 'true') return {status:'disabled'};
  if (!env.PRODUCTION_DB || !env.STAGING_DB || env.PRODUCTION_DB === env.STAGING_DB) throw new Error('Separate database bindings are required');
  const production = await snapshot(env.PRODUCTION_DB);
  const stagingSession = env.STAGING_DB.withSession('first-primary');
  const before = await snapshot(stagingSession);
  if (canonical(production.schema) !== canonical(before.schema)) throw new Error('Schema mismatch; apply staging migrations before refreshing');
  if (production.tables[0].length === 0) throw new Error('Empty production service snapshot; refusing refresh');
  const changed = TABLES.map((table,index) => ({table,index})).filter(({index}) => canonical(production.tables[index]) !== canonical(before.tables[index]));
  const statements = [];
  for (const {table,index} of changed) {
    const rows = production.tables[index];
    statements.push(stagingSession.prepare(`DELETE FROM ${table}`));
    if (!rows.length) continue;
    const columns = Object.keys(rows[0]);
    if (rows.some(row => Object.keys(row).sort().join() !== [...columns].sort().join())) throw new Error('Inconsistent snapshot columns');
    // JSON table input keeps the batch small while binding all application data.
    const select = columns.map(column => `json_extract(value, '$.${identifier(column).slice(1,-1)}')`);
    statements.push(stagingSession.prepare(`INSERT INTO ${table} (${columns.map(identifier).join(',')}) SELECT ${select.join(',')} FROM json_each(?)`).bind(JSON.stringify(rows)));
  }
  const bookmark = stagingSession.getBookmark();
  // Save a recovery bookmark before replacing test records. Never log contents.
  if (changed.length) console.log(JSON.stringify({event:'staging_refresh_before',bookmark,tables:changed.map(item => item.table)}));
  // D1 batches are transactional: a failed insert rolls back every delete.
  if (statements.length) {
    const result = await stagingSession.batch(statements);
    if (result.some(item => !item.success)) throw new Error('Staging refresh transaction failed');
  }
  const after = await snapshot(stagingSession);
  if (production.tables.some((rows,index) => canonical(rows) !== canonical(after.tables[index]))) throw new Error('Staging verification failed');
  return {status:'synced',changedTables:changed.map(item => item.table),rows:Object.fromEntries(TABLES.map((table,index) => [table,production.tables[index].length]))};
}
export default {
  async scheduled(event,env,ctx) {
    if (!isRefreshTime(event.scheduledTime)) return;
    ctx.waitUntil((async () => {
      try { console.log(JSON.stringify({event:'staging_refresh',...await refreshStaging(env)})); }
      catch { console.error(JSON.stringify({event:'staging_refresh_failed'})); throw new Error('Staging refresh failed; inspect schemas and bindings'); }
    })());
  },
  async fetch(request,env) {
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/health') return new Response('Not found',{status:404});
    return Response.json({service:'skyline-pulse-staging-sync',enabled:env.SYNC_ENABLED === 'true',direction:'production-to-staging',schedule:'Daily at 03:00 America/New_York'}, {headers:{'Cache-Control':'no-store'}});
  },
};
