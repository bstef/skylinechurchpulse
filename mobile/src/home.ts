// Home page content, ported from renderHome() in ../index.html.
// tests/home.test.ts checks the section cards against the website's HOME_CARDS.
import { isSkyYouthPlan, planStatus, type PcoPlan, type ProductionEntry, type ServiceEntry } from './logging.ts';

export type HomeCard = { key: string; icon: string; title: string; desc: string; href: '/services' | '/production' | '/skyyouth' | null };

// Same order and wording as the website. Cards without an href aren't in the app yet.
export const HOME_CARDS: HomeCard[] = [
  { key: 'services', icon: '🗓️', title: 'Sunday Services', desc: "Log attendance, unity, engagement, and flow for this week's services.", href: '/services' },
  { key: 'production', icon: '🎛️', title: 'Production', desc: 'Role attendance and a slides fit-check for the tech team.', href: '/production' },
  { key: 'skyyouth', icon: '🎧', title: 'SkyYouth', desc: "SkyYouth's own Planning Center feed and ledger.", href: '/skyyouth' },
  { key: 'serving', icon: '🙋', title: 'Planning Center Responses', desc: "Who's confirmed, declined, or hasn't answered yet — per upcoming plan.", href: null },
  { key: 'calendar', icon: '📅', title: 'Calendar', desc: "See what's logged and what's still needed, by day or month.", href: null },
  { key: 'analytics', icon: '📈', title: 'Analytics', desc: 'Trends for Services, Production, and SkyYouth over time.', href: null },
  { key: 'exports', icon: '⬇️', title: 'Exports', desc: 'CSV, PDF tables, or print-ready reports for any dataset.', href: null },
];

export type Serving = { responded: number; needs_response: number; total_signups: number };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Nov 9, 2026", like the website's fmtDate; without the year for chart labels.
export function formatDate(date: string, withYear = true): string {
  const [year, month, day] = date.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return date;
  return `${MONTHS[month - 1]} ${day}${withYear ? `, ${year}` : ''}`;
}

const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function homeSummary(services: ServiceEntry[], production: ProductionEntry[], plans: PcoPlan[], today: string, nowMs = Date.now()) {
  const sunday = services.filter(e => e.service_type !== 'SkyYouth');
  const needsDetails = (youth: boolean) => plans.filter(p => isSkyYouthPlan(p) === youth && planStatus(p, services, today) === 'needs-details').length;
  return {
    sundayCount: sunday.length,
    youthCount: services.length - sunday.length,
    productionCount: production.length,
    upcomingPlans: plans.filter(p => new Date(p.sort_date).getTime() > nowMs).length,
    avgAttendance: average(sunday.map(e => e.attendance)),
    avgUnity: average(sunday.map(e => e.unity)),
    avgEngagement: average(sunday.map(e => e.engagement)),
    sundayNeedsDetails: needsDetails(false),
    youthNeedsDetails: needsDetails(true),
  };
}

// The last eight Sunday services, oldest first, as on the website's attendance chart.
export function attendanceTrend(services: ServiceEntry[], count = 8) {
  return services
    .filter(e => e.service_type !== 'SkyYouth')
    .sort((a, b) => a.service_date.localeCompare(b.service_date))
    .slice(-count)
    .map(e => ({ id: e.id, label: formatDate(e.service_date, false), serviceType: e.service_type, attendance: e.attendance }));
}

export type RecentItem = { id: string; kind: 'Service' | 'Production'; serviceType: string; date: string; loggedBy: string | null };
// The most recently saved entries across services and production.
export function recentlyLogged(services: ServiceEntry[], production: ProductionEntry[], limit = 5): RecentItem[] {
  const item = (kind: RecentItem['kind']) => (e: ServiceEntry | ProductionEntry) => ({
    id: e.id, kind, serviceType: e.service_type, date: e.service_date, loggedBy: e.logged_by ?? null, createdAt: e.created_at ?? '',
  });
  return [...services.map(item('Service')), ...production.map(item('Production'))]
    .filter(e => e.createdAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(({ createdAt, ...rest }) => rest);
}

export function cardCount(key: string, summary: ReturnType<typeof homeSummary>, serving: Serving | null): string | null {
  if (key === 'services') return `${summary.sundayCount} logged`;
  if (key === 'production') return `${summary.productionCount} logged`;
  if (key === 'skyyouth') return `${summary.youthCount} logged`;
  if (key === 'serving') return serving ? `${serving.needs_response} awaiting response` : 'From Planning Center';
  return null;
}
