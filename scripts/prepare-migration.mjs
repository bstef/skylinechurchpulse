// Prepare private, lossless application data exports. Never commit generated output.
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const [input, output='exports/prepared'] = process.argv.slice(2);
if (!input) throw new Error('Usage: node scripts/prepare-migration.mjs SNAPSHOT.json OUTPUT_DIR');
const snapshot=JSON.parse(readFileSync(input,'utf8'));
if(snapshot.project_ref!=='uvwgotklgfhvqbcpdqqb') throw new Error('Unexpected source project');
const allowed=['service_entries','production_entries','email_recipients','email_log','host_entries'];
if(Object.keys(snapshot.tables).sort().join()!==[...allowed].sort().join()) throw new Error('Unexpected source tables');
const db=new DatabaseSync(':memory:');
for(const file of readdirSync('migrations').sort()) db.exec(readFileSync('migrations/'+file,'utf8'));
function quote(name){if(!/^[a-z_][a-z0-9_]*$/.test(name))throw new Error('Invalid identifier');return '"'+name+'"';}
function sqlValue(value){
 if(value===null)return 'NULL';
 if(typeof value==='boolean')return value?'1':'0';
 if(typeof value==='number'&&Number.isSafeInteger(value))return String(value);
 if(typeof value==='string')return "CAST(X'"+Buffer.from(value,'utf8').toString('hex')+"' AS TEXT)";
 throw new Error('Unsupported value type');
}
function pgValue(value){
 if(value===null)return 'NULL';
 if(typeof value==='boolean')return value?'TRUE':'FALSE';
 if(typeof value==='number'&&Number.isSafeInteger(value))return String(value);
 if(typeof value==='string')return "convert_from(decode('"+Buffer.from(value,'utf8').toString('hex')+"','hex'),'UTF8')";
 throw new Error('Unsupported value type');
}
const canonical=rows=>JSON.stringify(rows.map(row=>Object.fromEntries(Object.keys(row).sort().map(k=>[k,typeof row[k]==='boolean'?Number(row[k]):row[k]]))).sort((a,b)=>a.id.localeCompare(b.id)));
const sha=rows=>createHash('sha256').update(canonical(rows)).digest('hex');
const queries=[];const postgres=['-- Restore only into an EMPTY PostgreSQL database/project after review.','BEGIN;'];
const manifest={project_ref:snapshot.project_ref,exported_at:snapshot.exported_at,tables:{}};
for(const table of allowed){
 const sourceCols=snapshot.columns.filter(c=>c.table_name===table).sort((a,b)=>a.ordinal_position-b.ordinal_position);
 const targetCols=db.prepare(`PRAGMA table_info(${quote(table)})`).all();
 if(sourceCols.map(c=>c.column_name).sort().join()!==targetCols.map(c=>c.name).sort().join())throw new Error(`Schema mismatch: ${table}`);
 postgres.push(`CREATE TABLE public.${quote(table)} (\n${sourceCols.map(c=>`  ${quote(c.column_name)} ${c.data_type}${c.column_default?' DEFAULT '+c.column_default:''}${c.is_nullable==='NO'?' NOT NULL':''}`).join(',\n')}\n);`);
 for(const c of snapshot.constraints.filter(c=>c.table===table))postgres.push(`ALTER TABLE public.${quote(table)} ADD CONSTRAINT ${quote(c.name)} ${c.definition};`);
 const columns=sourceCols.map(c=>c.column_name);
 for(const row of snapshot.tables[table]){
  if(Object.keys(row).sort().join()!==[...columns].sort().join())throw new Error(`Row/schema mismatch: ${table}`);
  const values=columns.map(k=>row[k]);
  const sql=`INSERT INTO ${quote(table)} (${columns.map(quote).join(',')}) VALUES (${values.map(sqlValue).join(',')});`;
  queries.push(sql);db.exec(sql);
  postgres.push(`INSERT INTO public.${quote(table)} (${columns.map(quote).join(',')}) VALUES (${values.map(pgValue).join(',')});`);
 }
 for(const index of snapshot.indexes.filter(i=>i.tablename===table&&!snapshot.constraints.some(c=>c.table===table&&c.name===i.indexname)))postgres.push(index.indexdef+';');
 postgres.push(`ALTER TABLE public.${quote(table)} ENABLE ROW LEVEL SECURITY;`);
 for(const p of snapshot.policies.filter(p=>p.tablename===table)){
  // Policy names can contain spaces; all identifiers are escaped as identifiers.
  const policy='"'+p.policyname.replaceAll('"','""')+'"';
  const roles=p.roles.map(r=>r==='public'?'PUBLIC':quote(r)).join(',');
  postgres.push(`CREATE POLICY ${policy} ON public.${quote(table)} AS ${p.permissive} FOR ${p.cmd} TO ${roles}${p.qual?' USING ('+p.qual+')':''}${p.with_check?' WITH CHECK ('+p.with_check+')':''};`);
 }
 for(const g of snapshot.grants.filter(g=>g.table_name===table&&['anon','authenticated','service_role'].includes(g.grantee))){
  if(!['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'].includes(g.privilege_type))throw new Error('Unsupported grant');
  postgres.push(`GRANT ${g.privilege_type} ON public.${quote(table)} TO ${quote(g.grantee)};`);
 }
 const restored=db.prepare(`SELECT * FROM ${quote(table)}`).all();
 if(sha(snapshot.tables[table])!==sha(restored))throw new Error('Restore mismatch: '+table);
 manifest.tables[table]={rows:restored.length,sha256:sha(restored)};
}
postgres.push('COMMIT;');
mkdirSync(output,{recursive:true,mode:0o700});
writeFileSync(resolve(output,'d1-import.sql'),queries.join('\n')+'\n',{mode:0o600});
writeFileSync(resolve(output,'d1-queries.json'),JSON.stringify(queries),{mode:0o600});
writeFileSync(resolve(output,'postgres-restore.sql'),postgres.join('\n')+'\n',{mode:0o600});
writeFileSync(resolve(output,'verification.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
writeFileSync(resolve(output,'README.txt'),'Private application backup for SkylineChurchLedger. Contains all five public application tables, original IDs/timestamps, columns, constraints, indexes, RLS policies and grants. No Auth users or Storage objects existed at audit. This is an application logical snapshot, not a full Supabase infrastructure or physical backup. SQLite restore and per-table SHA-256 parity verified. PostgreSQL restore SQL is generated but has not been run against PostgreSQL. Review defaults/policies/grants before executing in an empty recovery project. Never import into the live project.\n',{mode:0o600});
console.log(JSON.stringify(manifest,null,2));db.close();
