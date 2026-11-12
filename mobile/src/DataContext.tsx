import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext.tsx';
import { saveErrorMessage, type PcoPlan, type ProductionEntry, type ServiceEntry } from './logging.ts';
import type { Serving } from './home.ts';

type Table = 'service_entries' | 'production_entries';
type Loadable<T> = { rows: T[]; loading: boolean; error: string | null };
type PlansState = Loadable<PcoPlan> & { daysPast: number; daysPastMax: number; checkinsUnavailable: boolean };

type DataState = {
  services: Loadable<ServiceEntry>;
  production: Loadable<ProductionEntry>;
  plans: PlansState;
  // Planning Center serving signups for the Home page; null while loading or if unavailable.
  serving: Serving | null;
  refreshAll: () => Promise<void>;
  refreshPlans: (daysPast?: number) => Promise<void>;
  // Each returns an error message to show, or null on success; the lists reload either way.
  save: (table: Table, payload: Record<string, unknown>, id?: string) => Promise<string | null>;
  remove: (table: Table, id: string) => Promise<string | null>;
};
const DataContext = createContext<DataState | null>(null);

// Matches the website's "Load older services" step and the server's default window.
export const PLANS_DAYS_PAST = 14;
export const LOAD_MORE_STEP_DAYS = 14;
const empty = <T,>(): Loadable<T> => ({ rows: [], loading: true, error: null });

// One shared cache for both lists and Planning Center plans, so every screen updates after a save.
export function DataProvider({ children }: { children: ReactNode }) {
  const { api, status } = useAuth();
  const signedIn = status === 'signed-in';
  const [services, setServices] = useState<Loadable<ServiceEntry>>(empty);
  const [production, setProduction] = useState<Loadable<ProductionEntry>>(empty);
  const [serving, setServing] = useState<Serving | null>(null);
  const [plans, setPlans] = useState<PlansState>({ ...empty<PcoPlan>(), daysPast: PLANS_DAYS_PAST, daysPastMax: 120, checkinsUnavailable: false });

  // Bumped on every sign-in and sign-out; a load that finishes under an older value is ignored,
  // so a reply that arrives after signing out can't refill the cleared cache.
  const session = useRef(0);

  const loadTable = useCallback(async (table: Table) => {
    const set = (table === 'service_entries' ? setServices : setProduction) as (update: (s: Loadable<any>) => Loadable<any>) => void;
    set(state => ({ ...state, loading: true }));
    const generation = session.current;
    const result = await api.list(table);
    if (generation !== session.current) return;
    // Keep the rows already shown if a reload fails, and say why.
    set(state => ({ rows: result.data ?? state.rows, loading: false, error: result.error?.message ?? null }));
  }, [api]);

  const refreshPlans = useCallback(async (daysPast?: number) => {
    setPlans(state => ({ ...state, loading: true }));
    const generation = session.current;
    const result = await api.plans<PcoPlan>(daysPast ?? PLANS_DAYS_PAST);
    if (generation !== session.current) return;
    setPlans(state => result.data ? {
      rows: result.data.plans ?? [],
      loading: false,
      error: null,
      daysPast: result.data.days_past ?? state.daysPast,
      daysPastMax: result.data.days_past_max ?? state.daysPastMax,
      checkinsUnavailable: (result.data.warnings ?? []).some(w => w.source === 'check-ins'),
    } : { ...state, loading: false, error: result.error?.message ?? 'Planning Center is unavailable.' });
  }, [api]);

  const loadServing = useCallback(async () => {
    const generation = session.current;
    const result = await api.stats<Serving>();
    if (generation !== session.current) return;
    const section = result.data?.serving;
    // Keep the last numbers if a reload fails; the section carries its own error when Planning Center can't answer.
    if (section && !section.error) setServing({ responded: section.responded, needs_response: section.needs_response, total_signups: section.total_signups });
  }, [api]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadTable('service_entries'), loadTable('production_entries'), refreshPlans(plans.daysPast), loadServing()]);
  }, [loadTable, refreshPlans, loadServing, plans.daysPast]);

  // Load once signed in; forget everything on sign-out so the next person starts clean.
  useEffect(() => {
    session.current += 1;
    if (!signedIn) {
      setServices(empty());
      setProduction(empty());
      setPlans(state => ({ ...state, ...empty<PcoPlan>(), daysPast: PLANS_DAYS_PAST }));
      setServing(null);
      return;
    }
    loadTable('service_entries');
    loadTable('production_entries');
    refreshPlans();
    loadServing();
  }, [signedIn, loadTable, refreshPlans, loadServing]);

  const save = useCallback(async (table: Table, payload: Record<string, unknown>, id?: string) => {
    const result = id ? await api.update(table, id, payload) : await api.create(table, payload);
    await loadTable(table);
    return result.error ? saveErrorMessage(result.error, table, payload) : null;
  }, [api, loadTable]);

  const remove = useCallback(async (table: Table, id: string) => {
    const result = await api.remove(table, id);
    await loadTable(table);
    return result.error ? "Couldn't delete: " + result.error.message : null;
  }, [api, loadTable]);

  const value = useMemo(() => ({ services, production, plans, serving, refreshAll, refreshPlans, save, remove }),
    [services, production, plans, serving, refreshAll, refreshPlans, save, remove]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const value = useContext(DataContext);
  if (!value) throw new Error('useData must be used inside DataProvider');
  return value;
}
