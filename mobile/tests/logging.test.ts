import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePayload } from '../../functions/api/data/[[path]].js';
import { TABLES } from '../../lib/d1-store.js';
import {
  entriesForPlan, guessServiceType, isSkyYouthPlan, nameSuggestions, PCO_SERVICE_TYPE_ALIASES, planStatus, PRODUCTION_ROLES,
  productionDefaults, productionPayload, saveErrorMessage, serviceDefaults, serviceLocked, servicePayload, SERVICE_TYPES,
  SLIDES_GRADE_LABELS, validateProduction, validateService, type PcoPlan, type ServiceEntry,
} from '../src/logging.ts';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
// Evaluates a constant's literal from the website's own source, so the two can't drift.
const websiteConstant = (name: string) => {
  const match = new RegExp(`const ${name} = ([\\[{][\\s\\S]*?[\\]}]);\\n`).exec(html);
  assert.ok(match, `${name} not found in index.html`);
  return new Function(`return ${match[1]}`)();
};

test('service types, aliases, roles and slide grades match the website', () => {
  assert.deepEqual([...SERVICE_TYPES], websiteConstant('SERVICE_TYPES'));
  assert.deepEqual(PCO_SERVICE_TYPE_ALIASES, websiteConstant('PCO_SERVICE_TYPE_ALIASES'));
  assert.deepEqual(PRODUCTION_ROLES.map(r => ({ ...r })), websiteConstant('PRODUCTION_ROLES'));
  assert.deepEqual(SLIDES_GRADE_LABELS, websiteConstant('SLIDES_GRADE_LABELS'));
  // The server accepts exactly these service types.
  for (const type of SERVICE_TYPES) assert.doesNotThrow(() => validatePayload('service_entries', { service_type: type }));
});

test('Planning Center names map to service types like the website', () => {
  assert.equal(guessServiceType('9:30 AM'), '9:30 AM');
  assert.equal(guessServiceType('Celebration Service 11:00'), '11:00 AM');
  assert.equal(guessServiceType('SkyYOUTH'), 'SkyYouth');
  assert.equal(guessServiceType('Baptism Class'), '');
  assert.equal(isSkyYouthPlan(plan({ service_type_name: 'SkyYOUTH', plan_time_name: null })), true);
});

const today = '2026-11-08';
const plan = (overrides: Partial<PcoPlan> = {}): PcoPlan => ({ id: 'p1-930', plan_id: 'p1', title: 'Sunday', sort_date: '2026-11-08T14:30:00Z', service_type_name: 'Celebration Service', plan_time_name: '9:30 AM', attendance_from_pco: 212, ...overrides });
const filled = <T extends { attendance?: string; loudness?: string; loggedBy: string }>(form: T): T => ({ ...form, attendance: form.attendance || '180', loudness: '91', loggedBy: 'Jordan' });

test('every payload the forms build passes the server validation', () => {
  const manual = filled(serviceDefaults({}, '', today));
  manual.service = '11:00 AM';
  const fromPlan = filled(serviceDefaults({ plan: plan() }, 'Jordan', today));
  const edited = filled(serviceDefaults({ entry: { ...existing, notes: null, host_name: null } }, '', today));
  for (const [form, context] of [[manual, {}], [fromPlan, { plan: plan() }], [edited, { entry: existing }]] as const) {
    const payload = servicePayload(form, context);
    assert.deepEqual(Object.keys(payload).filter(key => !TABLES.service_entries.fields.includes(key)), []);
    assert.doesNotThrow(() => validatePayload('service_entries', payload), JSON.stringify(payload));
  }
  const production = { ...productionDefaults(null, 'Jordan', today), service: '9:30 AM', slidesMisses: '-3' };
  const payload = productionPayload(production);
  assert.equal(payload.slides_miss_count, 0);
  assert.deepEqual(Object.keys(payload).filter(key => !TABLES.production_entries.fields.includes(key)), []);
  assert.doesNotThrow(() => validatePayload('production_entries', payload));
});

const existing: ServiceEntry = {
  id: 'e1', service_date: '2026-11-01', service_type: '9:30 AM', attendance: 200, attendance_pco_value: 198, unity: 4, engagement: 5,
  loudness_db: 90, sound_clarity: false, spiritual_response: 7, transition_clarity: 4, lighting_fit: true, talking_fit: false,
  announcements_fit: true, sermon_fit: true, host_name: 'Sam', intro_welcoming: 2, notes: 'Good', pco_plan_id: 'p0', logged_by: 'Ana',
};

test('new, plan-linked and edited services start from the website defaults', () => {
  const blank = serviceDefaults({}, 'Jordan', today);
  assert.deepEqual([blank.date, blank.service, blank.attendance, blank.unity, blank.spiritualResponse, blank.soundClarity, blank.loggedBy], [today, '', '', 3, 5, true, 'Jordan']);
  const fromPlan = serviceDefaults({ plan: plan() }, '', today);
  assert.deepEqual([fromPlan.date, fromPlan.service, fromPlan.attendance], ['2026-11-08', '9:30 AM', '212']);
  assert.equal(serviceLocked({ plan: plan() }), true);
  assert.equal(serviceLocked({ plan: plan({ plan_time_name: 'Rehearsal', service_type_name: 'Baptism' }) }), false);
  const edit = serviceDefaults({ entry: existing }, 'Someone else', today);
  assert.deepEqual([edit.attendance, edit.soundClarity, edit.loggedBy, edit.introWelcoming], ['200', false, 'Ana', 2]);
  // Editing keeps the original plan link and Planning Center attendance.
  const payload = servicePayload(filled(edit), { entry: existing });
  assert.deepEqual([payload.pco_plan_id, payload.attendance_pco_value], ['p0', 198]);
});

test('validation catches the same mistakes as the website, plus non-numbers', () => {
  const form = filled({ ...serviceDefaults({}, '', today), service: '9:30 AM' });
  assert.equal(validateService(form, today), null);
  assert.equal(validateService({ ...form, service: '' }, today), 'Please select a service.');
  assert.equal(validateService({ ...form, loudness: '' }, today), 'Attendance and loudness (dB) are required.');
  assert.equal(validateService({ ...form, attendance: '12.5' }, today), 'Attendance must be a whole number.');
  assert.match(validateService({ ...form, loudness: '250' }, today)!, /0–200/);
  assert.equal(validateService({ ...form, loggedBy: '  ' }, today), 'Please enter your name so we know who logged this.');
  assert.equal(validateService({ ...form, date: '2026-11-09' }, today), "Can't log details for a service that hasn't happened yet.");
  const production = { ...productionDefaults(null, 'Jordan', today), service: '11:00 AM' };
  assert.equal(validateProduction(production, today), null);
  assert.equal(validateProduction({ ...production, date: '2027-01-01' }, today), "Can't log details for a service that hasn't happened yet.");
});

test('plans show the right status and only match entries that really belong to them', () => {
  const p = plan();
  assert.equal(planStatus(p, [], today), 'needs-details');
  assert.equal(planStatus(plan({ sort_date: '2026-11-15T14:30:00Z' }), [], today), 'upcoming');
  const linked = { ...existing, pco_plan_id: 'p1', service_type: '9:30 AM' };
  assert.equal(planStatus(p, [linked], today), 'logged');
  // A manual entry (no plan ID) matches only the same date and known service time.
  const manual = { ...existing, pco_plan_id: null, service_date: '2026-11-08', service_type: '9:30 AM' };
  assert.deepEqual(entriesForPlan(p, [manual]).map(e => e.id), ['e1']);
  assert.deepEqual(entriesForPlan(plan({ plan_time_name: 'Rehearsal', service_type_name: 'Baptism' }), [manual]), []);
  // An unmatched plan can still take a second entry of another type.
  const unmatched = plan({ plan_time_name: null, service_type_name: 'Baptism' });
  assert.equal(planStatus(unmatched, [linked], today), 'log-another');
});

test('save errors explain duplicates in context', () => {
  const duplicate = { message: 'This record already exists.', code: '23505' };
  assert.equal(saveErrorMessage(duplicate, 'service_entries', { service_type: '9:30 AM', pco_plan_id: 'p1' }), 'You\'ve already logged "9:30 AM" for this Planning Center plan.');
  assert.equal(saveErrorMessage(duplicate, 'production_entries', { service_type: '9:30 AM' }), 'Production for "9:30 AM" on this date is already logged.');
  assert.equal(saveErrorMessage({ message: 'Network down' }, 'service_entries', {}), "Couldn't save: Network down");
});

test('name suggestions are unique, sorted, prefix-matched and skip an exact match', () => {
  const names = ['Sam', 'sara', 'Sam', null, ' ', 'Ana', 'Samuel'];
  assert.deepEqual(nameSuggestions(names, 'sa'), ['Sam', 'Samuel', 'sara']);
  assert.deepEqual(nameSuggestions(names, 'sam'), ['Samuel']);
  assert.deepEqual(nameSuggestions(names, ''), ['Ana', 'Sam', 'Samuel', 'sara']);
});
