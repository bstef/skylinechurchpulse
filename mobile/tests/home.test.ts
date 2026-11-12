import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { attendanceTrend, cardCount, formatDate, HOME_CARDS, homeSummary, recentlyLogged } from '../src/home.ts';
import type { PcoPlan, ProductionEntry, ServiceEntry } from '../src/logging.ts';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

test('section cards match the website home page, in order', () => {
  const block = html.slice(html.indexOf('const HOME_CARDS = ['), html.indexOf('function renderHome()'));
  const website = [...block.matchAll(/icon: "([^"]+)", title: "([^"]+)", desc: "([^"]+)"/g)].map(m => ({ icon: m[1], title: m[2], desc: m[3] }));
  assert.equal(website.length, 7);
  assert.deepEqual(HOME_CARDS.map(({ icon, title, desc }) => ({ icon, title, desc })), website);
  // Only sections the app has built are tappable.
  assert.deepEqual(HOME_CARDS.filter(c => c.href).map(c => c.key), ['services', 'production', 'skyyouth']);
});

const entry = (id: string, date: string, overrides: Partial<ServiceEntry> = {}): ServiceEntry => ({
  id, service_date: date, service_type: '9:30 AM', attendance: 100, attendance_pco_value: null, unity: 4, engagement: 3, loudness_db: 90,
  sound_clarity: true, spiritual_response: 5, transition_clarity: 3, lighting_fit: true, talking_fit: true, announcements_fit: true,
  sermon_fit: true, host_name: null, intro_welcoming: 3, notes: null, pco_plan_id: null, logged_by: 'Ana', created_at: `${date}T15:00:00Z`, ...overrides,
});
const production = (id: string, date: string, createdAt?: string) => ({ id, service_date: date, service_type: '11:00 AM', logged_by: null, created_at: createdAt }) as ProductionEntry;
const plan = (id: string, sortDate: string, folder = 'Celebration Service'): PcoPlan => ({ id, plan_id: id, title: 'Sunday', sort_date: sortDate, service_type_name: folder, plan_time_name: '9:30 AM' });

test('summary counts and averages match the website rules', () => {
  const services = [entry('a', '2026-11-01', { attendance: 200, unity: 5 }), entry('b', '2026-11-08', { attendance: 100, unity: 4 }), entry('y', '2026-11-06', { service_type: 'SkyYouth', attendance: 40 })];
  const plans = [plan('past', '2026-11-08T14:30:00Z'), plan('future', '2026-11-15T14:30:00Z'), plan('youth', '2026-11-13T23:00:00Z', 'SkyYOUTH')];
  const summary = homeSummary(services, [production('p', '2026-11-08')], plans, '2026-11-10', Date.parse('2026-11-10T12:00:00Z'));
  assert.deepEqual([summary.sundayCount, summary.youthCount, summary.productionCount, summary.upcomingPlans], [2, 1, 1, 2]);
  // SkyYouth is left out of the Sunday averages.
  assert.deepEqual([summary.avgAttendance, summary.avgUnity], [150, 4.5]);
  // The past plan's 9:30 entry (manual, same date and time) counts as logged.
  assert.equal(summary.sundayNeedsDetails, 0);
  const empty = homeSummary([], [], [], '2026-11-10');
  assert.equal(empty.avgAttendance, null);
});

test('attendance trend is the last eight Sunday services, oldest first', () => {
  const services = Array.from({ length: 10 }, (_, i) => entry(`e${i}`, `2026-09-${String(i + 1).padStart(2, '0')}`, { attendance: i }));
  services.push(entry('youth', '2026-09-30', { service_type: 'SkyYouth' }));
  const trend = attendanceTrend(services.reverse());
  assert.deepEqual(trend.map(p => p.attendance), [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(trend[0].label, 'Sep 3');
});

test('recently logged mixes services and production by save time and skips entries without one', () => {
  const recent = recentlyLogged(
    [entry('s1', '2026-11-01', { created_at: '2026-11-02T10:00:00Z' }), entry('s2', '2026-11-08', { created_at: undefined })],
    [production('p1', '2026-11-08', '2026-11-09T10:00:00Z')],
  );
  assert.deepEqual(recent.map(r => `${r.kind}:${r.id}`), ['Production:p1', 'Service:s1']);
  assert.equal(recent[1].loggedBy, 'Ana');
});

test('dates and card counts read like the website', () => {
  assert.equal(formatDate('2026-11-09'), 'Nov 9, 2026');
  assert.equal(formatDate('2026-01-31', false), 'Jan 31');
  assert.equal(formatDate('not a date'), 'not a date');
  const summary = homeSummary([entry('a', '2026-11-01')], [], [], '2026-11-10');
  assert.equal(cardCount('services', summary, null), '1 logged');
  assert.equal(cardCount('serving', summary, null), 'From Planning Center');
  assert.equal(cardCount('serving', summary, { responded: 4, needs_response: 3, total_signups: 7 }), '3 awaiting response');
  assert.equal(cardCount('calendar', summary, null), null);
});
