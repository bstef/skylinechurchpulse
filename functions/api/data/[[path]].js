import { tableDefinition, listRows } from '../../../lib/d1-store.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const integerFields = new Set(['attendance','attendance_pco_value','unity','engagement','loudness_db','spiritual_response','transition_clarity','intro_welcoming','slides_grade','slides_miss_count']);
const nullable = new Set(['attendance_pco_value','pco_plan_id','logged_by','host_name','lights_name','camera_name','director_name','computer_name','audio_name']);
const ranges = { attendance:[0,1000000], attendance_pco_value:[0,1000000], unity:[1,5], engagement:[1,5], loudness_db:[0,200], spiritual_response:[0,10], transition_clarity:[1,5], intro_welcoming:[1,5], slides_grade:[1,4], slides_miss_count:[0,1000000] };
function fail(message, status = 400, code) {
  return Response.json({ error: { message, ...(code ? { code } : {}) } }, { status });
}
export function validatePayload(table, payload) {
  const def = tableDefinition(table);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Expected an object.');
  const fields = Object.keys(payload);
  if (!fields.length || fields.some(key => !def.fields.includes(key))) throw new Error('Invalid fields.');
  return fields.map(key => {
    const value = payload[key];
    if (value === null && nullable.has(key)) return [key, null];
    if (def.booleans.includes(key)) {
      if (typeof value !== 'boolean') throw new Error('Expected boolean values.');
      return [key, value ? 1 : 0];
    }
    if (integerFields.has(key)) {
      const [min,max] = ranges[key];
      if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('A number is outside its allowed range.');
      return [key, value];
    }
    if (typeof value !== 'string' || value.length > (key === 'notes' ? 20000 : 1000)) throw new Error('Invalid text value.');
    if (key === 'service_date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value+'T12:00:00Z').toISOString().slice(0,10) !== value)) throw new Error('Invalid service date.');
    if (key === 'service_type' && !['9:30 AM','11:00 AM','Worship Night','SkyYouth','Special Event'].includes(value)) throw new Error('Invalid service type.');
    if (key === 'email' && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)) throw new Error('Invalid email address.');
    return [key, value];
  });
}
async function readPayload(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('Expected JSON.');
  // Enforce the real streamed size, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body.');
  let size = 0;
  const chunks = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 65536) { await reader.cancel(); throw new Error('Request too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return fail('Database is not configured.', 503);
  const path = context.params.path || [];
  if (!Array.isArray(path) || path.length < 1 || path.length > 2) return fail('Not found.',404);
  const [table,id] = path;
  let def;
  try { def = tableDefinition(table); } catch { return fail('Not found.',404); }
  if (id && !UUID.test(id)) return fail('Invalid ID.');
  const method = request.method;
  try {
    if (method === 'GET' && !id) {
      const url = new URL(request.url);
      const offset = Number(url.searchParams.get('offset') || 0);
      if (!Number.isSafeInteger(offset) || offset < 0) return fail('Invalid offset.');
      const limit = table === 'email_log' ? 20 : 500;
      const data = await listRows(env.DB, table, { limit, offset });
      return Response.json({ data, nextOffset: table !== 'email_log' && data.length === limit ? offset+limit : null });
    }
    if (def.readOnly || (table === 'email_recipients' && method === 'PATCH')) return fail('Method not allowed.',405);
    if (!['POST','PATCH','DELETE'].includes(method) || (method === 'POST' ? !!id : !id)) return fail('Method not allowed.',405);
    if (method === 'DELETE') {
      const result = await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run();
      if (!result.meta.changes) return fail('Record not found.',404);
    } else {
      let values;
      try { values = validatePayload(table, await readPayload(request)); }
      catch { return fail('Invalid record. Check the fields and try again.'); }
      let result;
      if (method === 'POST') {
        const fields = ['id','created_at',...values.map(([key])=>key)];
        const params = [crypto.randomUUID(),new Date().toISOString(),...values.map(([,value])=>value)];
        result = await env.DB.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`).bind(...params).run();
      } else {
        result = await env.DB.prepare(`UPDATE ${table} SET ${values.map(([key])=>key+' = ?').join(',')} WHERE id = ?`).bind(...values.map(([,value])=>value),id).run();
        if (!result.meta.changes) return fail('Record not found.',404);
      }
    }
    return Response.json({ data: null });
  } catch (error) {
    // Preserve the existing frontend's duplicate-plan/recipient handling.
    if (/UNIQUE constraint failed/.test(error.message)) return fail('This record already exists.',409,'23505');
    if (/NOT NULL constraint failed|CHECK constraint failed/.test(error.message)) return fail('Required fields are missing or invalid.');
    console.error(JSON.stringify({ event:'database_request_failed',table,method }));
    return fail('Database request failed. Please try again.',500);
  }
}
