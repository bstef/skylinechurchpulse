import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LOAD_MORE_STEP_DAYS, useData } from './DataContext.tsx';
import { useTheme } from './ThemeContext.tsx';
import { Banner, Body, Button, Card, Heading } from './ui.tsx';
import { entriesForPlan, isSkyYouthPlan, localDate, planServiceType, planStatus, PRODUCTION_ROLES, type ProductionEntry, type ServiceEntry } from './logging.ts';

function Pill({ label, tone, onPress }: { label: string; tone: 'done' | 'todo' | 'muted'; onPress?: () => void }) {
  const { colors } = useTheme();
  const color = tone === 'done' ? colors.c3 : tone === 'todo' ? colors.brass : colors.muted;
  return (
    <Pressable accessibilityRole={onPress ? 'button' : 'text'} disabled={!onPress} onPress={onPress}
      style={({ pressed }) => [styles.pill, { borderColor: color, opacity: pressed ? 0.7 : 1 }]}>
      <Text style={{ color, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

// Planning Center plans for Sunday Services or SkyYouth, with what still needs logging.
export function PlansSection({ youth }: { youth: boolean }) {
  const { plans, services, refreshPlans } = useData();
  const today = localDate();
  const rows = plans.rows.filter(p => isSkyYouthPlan(p) === youth);
  const canLoadMore = plans.daysPast < plans.daysPastMax;
  return (
    <View style={{ gap: 12 }}>
      <Heading>Planning Center plans</Heading>
      {plans.error ? <Banner>{plans.error}</Banner> : null}
      {plans.checkinsUnavailable ? <Body muted>Attendance from Check-Ins isn't available, so enter headcounts by hand.</Body> : null}
      {!plans.loading && !plans.error && rows.length === 0 ? <Body muted>Nothing scheduled in the last {plans.daysPast} days or the next 45 days.</Body> : null}
      {rows.map(plan => {
        const status = planStatus(plan, services.rows, today);
        const linked = entriesForPlan(plan, services.rows);
        const matched = planServiceType(plan);
        return (
          <Card key={plan.id}>
            <Heading>{plan.sort_date.slice(0, 10)} · {matched || plan.plan_time_name || plan.service_type_name}</Heading>
            <Body muted>{plan.title}{plan.series_title ? ` · ${plan.series_title}` : ''}</Body>
            {plan.attendance_from_pco != null && status !== 'upcoming' ? <Body>{plan.attendance_from_pco.toLocaleString()} attending (from Planning Center)</Body> : null}
            <View style={styles.pills}>
              {linked.map(entry => <Pill key={entry.id} label={`${entry.service_type} ✓`} tone="done" onPress={() => router.push({ pathname: '/service-form', params: { id: entry.id } })} />)}
              {status === 'upcoming' ? <Pill label="Upcoming" tone="muted" /> : null}
              {status === 'needs-details' || status === 'log-another'
                ? <Pill label={status === 'needs-details' ? 'Needs details' : '+ Log another'} tone="todo" onPress={() => router.push({ pathname: '/service-form', params: { planId: plan.id } })} />
                : null}
            </View>
          </Card>
        );
      })}
      {canLoadMore && !plans.error ? (
        <Button label={plans.loading ? 'Loading…' : 'Load older services'} variant="secondary" busy={plans.loading}
          onPress={() => refreshPlans(Math.min(plans.daysPast + LOAD_MORE_STEP_DAYS, plans.daysPastMax))} />
      ) : null}
    </View>
  );
}

export function ServiceEntryCard({ entry }: { entry: ServiceEntry }) {
  return (
    <Pressable accessibilityRole="button" accessibilityHint="Opens this entry to edit" onPress={() => router.push({ pathname: '/service-form', params: { id: entry.id } })}>
      <Card>
        <Heading>{entry.service_date} · {entry.service_type}</Heading>
        <Body>{entry.attendance} attending · Unity {entry.unity}/5 · Engagement {entry.engagement}/5</Body>
        {entry.notes ? <Body muted>{entry.notes}</Body> : null}
        {entry.logged_by ? <Body muted>Logged by {entry.logged_by}</Body> : null}
      </Card>
    </Pressable>
  );
}

export function ProductionEntryCard({ entry }: { entry: ProductionEntry }) {
  const covered = PRODUCTION_ROLES.filter(({ key }) => entry[`${key}_present`]).length;
  return (
    <Pressable accessibilityRole="button" accessibilityHint="Opens this log to edit" onPress={() => router.push({ pathname: '/production-form', params: { id: entry.id } })}>
      <Card>
        <Heading>{entry.service_date} · {entry.service_type}</Heading>
        <Body>Roles covered {covered}/{PRODUCTION_ROLES.length} · Slides {entry.slides_grade}/4 · {entry.slides_miss_count} missed cues</Body>
        {entry.logged_by ? <Body muted>Logged by {entry.logged_by}</Body> : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  pill: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
});
