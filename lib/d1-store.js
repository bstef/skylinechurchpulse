// Shared by Pages Functions and the scheduled digest. No database credentials in the browser.
export const TABLES = {
  service_entries: {
    order: 'service_date DESC, created_at DESC, id DESC',
    booleans: ['sound_clarity','lighting_fit','talking_fit','announcements_fit','sermon_fit'],
    fields: ['service_date','service_type','attendance','attendance_pco_value','unity','engagement','loudness_db','sound_clarity','spiritual_response','transition_clarity','lighting_fit','talking_fit','announcements_fit','sermon_fit','notes','pco_plan_id','logged_by','host_name','intro_welcoming'],
  },
  production_entries: {
    order: 'service_date DESC, created_at DESC, id DESC',
    booleans: ['lights_present','camera_present','director_present','computer_present','audio_present','camera_direction_fit','slides_sync_fit'],
    fields: ['service_date','service_type','lights_present','lights_name','camera_present','camera_name','director_present','director_name','computer_present','computer_name','audio_present','audio_name','slides_grade','slides_miss_count','camera_direction_fit','notes','logged_by'],
  },
  email_recipients: { order: 'created_at ASC, id ASC', booleans: [], fields: ['email'] },
  email_log: { order: 'sent_at DESC, id DESC', booleans: [], fields: [], readOnly: true },
};
export function tableDefinition(table) {
  if (!Object.hasOwn(TABLES, table)) throw new Error('Unknown dataset');
  return TABLES[table];
}
export function decodeRow(table, row) {
  const result = { ...row };
  for (const key of tableDefinition(table).booleans) if (key in result) result[key] = result[key] === 1 || result[key] === true;
  return result;
}
export async function listRows(db, table, { limit = 500, offset = 0, since = null } = {}) {
  const def = tableDefinition(table);
  if (since && !['service_entries','production_entries'].includes(table)) throw new Error('Invalid date filter');
  const sql = `SELECT * FROM ${table}${since ? ' WHERE service_date >= ?' : ''} ORDER BY ${def.order} LIMIT ? OFFSET ?`;
  const { results } = await db.prepare(sql).bind(...(since ? [since] : []), limit, offset).all();
  return results.map(row => decodeRow(table, row));
}
export async function allRows(db, table, options = {}) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await listRows(db, table, { ...options, limit: 500, offset });
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
export async function recipients(db) {
  return (await allRows(db, 'email_recipients')).map(row => row.email);
}
export async function logEmail(db, { kind, dataset = null, subject, recipients: to, status, error = null, htmlBody = null }) {
  try {
    await db.prepare('INSERT INTO email_log (id, sent_at, kind, dataset, subject, recipients, recipient_count, status, error, html_body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), new Date().toISOString(), kind, dataset, subject, to.join(', '), to.length, status, error, htmlBody).run();
  } catch {
    console.error(JSON.stringify({ event: 'email_log_failed', kind }));
  }
}
export async function pruneEmailLogs(db) {
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  await db.prepare('DELETE FROM email_log WHERE julianday(sent_at) < julianday(?)').bind(cutoff).run();
}
