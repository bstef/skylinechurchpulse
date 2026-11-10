// Logging rules ported from ../index.html (openModal / openProductionModal and helpers).
// tests/logging.test.ts checks these against the website and the server's validatePayload.
import type { ApiError } from './api.ts';

export const SERVICE_TYPES = ['9:30 AM', '11:00 AM', 'Worship Night', 'SkyYouth', 'Special Event'] as const;
export type ServiceType = typeof SERVICE_TYPES[number];

// Best-effort mapping from Planning Center Service Type names to SERVICE_TYPES.
export const PCO_SERVICE_TYPE_ALIASES: Record<ServiceType, string[]> = {
  '9:30 AM': ['9:30', '930'],
  '11:00 AM': ['11:00', '1100', '11 am'],
  'Worship Night': ['worship night'],
  'SkyYouth': ['skyyouth', 'sky youth', 'youth'],
  'Special Event': ['special event'],
};

export const PRODUCTION_ROLES = [
  { key: 'lights', label: 'Lights' },
  { key: 'camera', label: 'Camera' },
  { key: 'director', label: 'Director' },
  { key: 'computer', label: 'Computer / ProPresenter' },
  { key: 'audio', label: 'Audio' },
] as const;
export type RoleKey = typeof PRODUCTION_ROLES[number]['key'];

export const SLIDES_GRADE_LABELS: Record<number, string> = { 1: '1 — Excellent', 2: '2 — Good', 3: '3 — Rough', 4: '4 — Poor' };
// Same key the website uses, so a name typed on either is remembered on this device.
export const LOGGED_BY_KEY = 'skyline-logged-by';

export type ServiceEntry = {
  id: string; service_date: string; service_type: string; attendance: number; attendance_pco_value: number | null;
  unity: number; engagement: number; loudness_db: number; sound_clarity: boolean; spiritual_response: number;
  transition_clarity: number; lighting_fit: boolean; talking_fit: boolean; announcements_fit: boolean; sermon_fit: boolean;
  host_name: string | null; intro_welcoming: number; notes: string | null; pco_plan_id: string | null; logged_by: string | null;
};
export type ProductionEntry = {
  id: string; service_date: string; service_type: string; slides_grade: number; slides_miss_count: number;
  camera_direction_fit: boolean; notes: string | null; logged_by: string | null;
} & { [K in `${RoleKey}_present`]: boolean } & { [K in `${RoleKey}_name`]: string | null };
export type PcoPlan = {
  id: string; plan_id: string; title: string; series_title?: string | null; sort_date: string;
  service_type_name: string; plan_time_name?: string | null; artwork_url?: string | null; attendance_from_pco?: number | null;
};

const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function guessServiceType(pcoName: string | null | undefined): ServiceType | '' {
  const n = norm(pcoName);
  for (const s of SERVICE_TYPES) if (norm(s) === n) return s;
  for (const [s, aliases] of Object.entries(PCO_SERVICE_TYPE_ALIASES)) {
    if (aliases.some(a => n.includes(norm(a)))) return s as ServiceType;
  }
  return '';
}
export const planServiceType = (plan: PcoPlan) => guessServiceType(plan.plan_time_name || plan.service_type_name);
// SkyYouth plans are split out by their Service Type folder, as on the website.
export const isSkyYouthPlan = (plan: PcoPlan) => guessServiceType(plan.service_type_name) === 'SkyYouth';

// Entries already logged for a plan. Manually logged entries (no plan ID) only match a
// known service time on the same date, never an ambiguous plan.
export function entriesForPlan(plan: PcoPlan, entries: ServiceEntry[]): ServiceEntry[] {
  const serviceType = planServiceType(plan);
  return entries.filter(entry => entry.pco_plan_id
    ? entry.pco_plan_id === plan.plan_id && (!serviceType || entry.service_type === serviceType)
    : !!serviceType && entry.service_date === plan.sort_date.slice(0, 10) && entry.service_type === serviceType);
}

export type PlanStatus = 'upcoming' | 'needs-details' | 'log-another' | 'logged';
export function planStatus(plan: PcoPlan, entries: ServiceEntry[], today: string): PlanStatus {
  const linked = entriesForPlan(plan, entries);
  if (plan.sort_date.slice(0, 10) > today) return 'upcoming';
  if (linked.length === 0) return 'needs-details';
  // A matched plan locks the service type, so a second entry would break the unique
  // (pco_plan_id, service_type) constraint; unmatched plans can still take another type.
  return planServiceType(plan) ? 'logged' : 'log-another';
}

// The phone's local calendar date, so "today" doesn't roll over at UTC midnight.
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export type ServiceForm = {
  date: string; service: string; attendance: string; unity: number; engagement: number; loudness: string;
  soundClarity: boolean; spiritualResponse: number; transitionClarity: number; lightingFit: boolean; talkingFit: boolean;
  announcementsFit: boolean; sermonFit: boolean; hostName: string; introWelcoming: number; notes: string; loggedBy: string;
};
export type ServiceContext = { entry?: ServiceEntry | null; plan?: PcoPlan | null };

export function serviceDefaults({ entry, plan }: ServiceContext, savedLoggedBy: string, today: string): ServiceForm {
  const pcoAttendance = pcoAttendanceFor({ entry, plan });
  return {
    date: entry ? entry.service_date : plan ? plan.sort_date.slice(0, 10) : today,
    service: entry ? entry.service_type : plan ? planServiceType(plan) : '',
    attendance: entry ? String(entry.attendance) : pcoAttendance != null ? String(pcoAttendance) : '',
    unity: entry?.unity ?? 3,
    engagement: entry?.engagement ?? 3,
    loudness: entry ? String(entry.loudness_db) : '',
    soundClarity: entry?.sound_clarity ?? true,
    spiritualResponse: entry?.spiritual_response ?? 5,
    transitionClarity: entry?.transition_clarity ?? 3,
    lightingFit: entry?.lighting_fit ?? true,
    talkingFit: entry?.talking_fit ?? true,
    announcementsFit: entry?.announcements_fit ?? true,
    sermonFit: entry?.sermon_fit ?? true,
    hostName: entry?.host_name ?? '',
    introWelcoming: entry?.intro_welcoming ?? 3,
    notes: entry?.notes ?? '',
    loggedBy: entry ? entry.logged_by ?? '' : savedLoggedBy,
  };
}
// A plan with a matched service type locks the service field, as on the website.
export const serviceLocked = ({ entry, plan }: ServiceContext) => !entry && !!plan && !!planServiceType(plan);
export function pcoAttendanceFor({ entry, plan }: ServiceContext): number | null {
  if (entry) return entry.attendance_pco_value ?? null;
  return plan?.attendance_from_pco ?? null;
}

const wholeNumber = (value: string) => /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;

export function validateService(form: ServiceForm, today: string): string | null {
  if (!form.service) return 'Please select a service.';
  if (!form.attendance.trim() || !form.loudness.trim()) return 'Attendance and loudness (dB) are required.';
  if (wholeNumber(form.attendance) === null) return 'Attendance must be a whole number.';
  const loudness = wholeNumber(form.loudness);
  if (loudness === null || loudness > 200) return 'Loudness must be a whole number of decibels (0–200).';
  if (!form.loggedBy.trim()) return 'Please enter your name so we know who logged this.';
  if (form.date > today) return "Can't log details for a service that hasn't happened yet.";
  return null;
}

export function servicePayload(form: ServiceForm, context: ServiceContext) {
  return {
    service_date: form.date,
    service_type: form.service,
    attendance: Number(form.attendance.trim()),
    attendance_pco_value: pcoAttendanceFor(context),
    unity: form.unity,
    engagement: form.engagement,
    loudness_db: Number(form.loudness.trim()),
    sound_clarity: form.soundClarity,
    spiritual_response: form.spiritualResponse,
    transition_clarity: form.transitionClarity,
    lighting_fit: form.lightingFit,
    talking_fit: form.talkingFit,
    announcements_fit: form.announcementsFit,
    sermon_fit: form.sermonFit,
    host_name: form.hostName.trim() || null,
    intro_welcoming: form.introWelcoming,
    notes: form.notes.trim(),
    pco_plan_id: context.entry ? context.entry.pco_plan_id ?? null : context.plan ? context.plan.plan_id : null,
    logged_by: form.loggedBy.trim(),
  };
}

export type ProductionForm = {
  date: string; service: string; slidesGrade: number; slidesMisses: string; cameraDirection: boolean; notes: string; loggedBy: string;
  roles: Record<RoleKey, { present: boolean; name: string }>;
};

export function productionDefaults(entry: ProductionEntry | null | undefined, savedLoggedBy: string, today: string): ProductionForm {
  const roles = Object.fromEntries(PRODUCTION_ROLES.map(({ key }) => [key, {
    present: entry ? entry[`${key}_present`] : true,
    name: entry ? entry[`${key}_name`] ?? '' : '',
  }])) as ProductionForm['roles'];
  return {
    date: entry ? entry.service_date : today,
    service: entry ? entry.service_type : '',
    slidesGrade: entry?.slides_grade || 1,
    slidesMisses: String(entry?.slides_miss_count ?? 0),
    cameraDirection: entry?.camera_direction_fit ?? true,
    notes: entry?.notes ?? '',
    loggedBy: entry ? entry.logged_by ?? '' : savedLoggedBy,
    roles,
  };
}

export function validateProduction(form: ProductionForm, today: string): string | null {
  if (!form.service) return 'Please select a service.';
  if (!form.loggedBy.trim()) return 'Please enter your name so we know who logged this.';
  if (form.date > today) return "Can't log details for a service that hasn't happened yet.";
  return null;
}

export function productionPayload(form: ProductionForm) {
  const payload: Record<string, unknown> = {
    service_date: form.date,
    service_type: form.service,
    notes: form.notes.trim(),
    slides_grade: form.slidesGrade,
    slides_miss_count: Math.max(0, parseInt(form.slidesMisses, 10) || 0),
    camera_direction_fit: form.cameraDirection,
    logged_by: form.loggedBy.trim(),
  };
  for (const { key } of PRODUCTION_ROLES) {
    payload[`${key}_present`] = form.roles[key].present;
    payload[`${key}_name`] = form.roles[key].name.trim();
  }
  return payload;
}

// The unique constraints make duplicates the most common save error; explain them in context.
export function saveErrorMessage(error: ApiError, table: 'service_entries' | 'production_entries', payload: { service_type?: unknown; pco_plan_id?: unknown }): string {
  if (error.code === '23505') {
    if (table === 'service_entries' && payload.pco_plan_id) return `You've already logged "${payload.service_type}" for this Planning Center plan.`;
    if (table === 'production_entries') return `Production for "${payload.service_type}" on this date is already logged.`;
  }
  return "Couldn't save: " + error.message;
}

// Up to five earlier names that start with what's been typed, for quick picking.
export function nameSuggestions(names: Array<string | null | undefined>, typed: string, limit = 5): string[] {
  const query = typed.trim().toLowerCase();
  const unique = [...new Set(names.filter((n): n is string => !!n && !!n.trim()).map(n => n.trim()))].sort();
  return unique.filter(n => n.toLowerCase().startsWith(query) && n.toLowerCase() !== query).slice(0, limit);
}
