import { Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '../../src/DataContext.tsx';
import { useTheme } from '../../src/ThemeContext.tsx';
import { localDate } from '../../src/logging.ts';
import { attendanceTrend, cardCount, formatDate, HOME_CARDS, homeSummary, recentlyLogged } from '../../src/home.ts';
import { Banner } from '../../src/ui.tsx';

const LOGO_LIGHT = require('../../assets/logo-light.png');
const LOGO_DARK = require('../../assets/logo-dark.png');
// The website's display font is Fraunces; these system serifs keep the same feel without a font download.
const DISPLAY = Platform.select({ ios: 'Georgia', default: 'serif' });

function Tile({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.line }]} accessible accessibilityLabel={`${label}: ${value}${suffix ?? ''}`}>
      <Text style={[styles.tileLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.tileValue, { color: colors.ink }]}>{value}{suffix ? <Text style={[styles.tileSuffix, { color: colors.muted }]}>{suffix}</Text> : null}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text>
      {children}
    </View>
  );
}

// Bars drawn with plain views, so the chart needs no extra native library.
function AttendanceChart({ points }: { points: ReturnType<typeof attendanceTrend> }) {
  const { colors } = useTheme();
  const max = Math.max(...points.map(p => p.attendance), 1);
  const summary = points.map(p => `${p.label} ${p.serviceType}: ${p.attendance}`).join(', ');
  return (
    <View style={styles.chart} accessible accessibilityLabel={`Attendance for the last ${points.length} services. ${summary}`}>
      {points.map(point => (
        <View key={point.id} style={styles.barColumn}>
          <Text style={[styles.barValue, { color: colors.ink }]}>{point.attendance}</Text>
          <View style={styles.barTrack}>
            <View style={[styles.bar, { backgroundColor: colors.pew, height: `${Math.max(4, (point.attendance / max) * 100)}%` }]} />
          </View>
          <Text style={[styles.barLabel, { color: colors.muted }]} numberOfLines={1}>{point.label}</Text>
        </View>
      ))}
    </View>
  );
}

export default function Home() {
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { services, production, plans, serving, refreshAll } = useData();
  const loading = services.loading || production.loading;
  const error = services.error || production.error;
  const summary = homeSummary(services.rows, production.rows, plans.rows, localDate());
  const trend = attendanceTrend(services.rows);
  const recent = recentlyLogged(services.rows, production.rows);
  const count = (n: number) => loading ? '…' : String(n);
  const hasAnyData = services.rows.length > 0 || production.rows.length > 0;

  const todo = [
    { n: summary.sundayNeedsDetails, label: 'Sunday', href: '/services' as const },
    { n: summary.youthNeedsDetails, label: 'SkyYouth', href: '/skyyouth' as const },
  ].filter(t => t.n > 0);

  return (
    <ScrollView
      style={{ backgroundColor: colors.paper }}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 12 }]}
      refreshControl={<RefreshControl refreshing={loading || plans.loading} onRefresh={refreshAll} tintColor={colors.brass} />}>
      <Image source={theme === 'light' ? LOGO_LIGHT : LOGO_DARK} style={styles.logo} resizeMode="contain" accessibilityLabel="Skyline Pulse" />

      <View style={[styles.hero, { backgroundColor: colors.brassSoft, borderColor: colors.line }]}>
        <Text style={[styles.kicker, { color: colors.brass }]}>Skyline Church · NJ</Text>
        <Text style={[styles.heroTitle, { color: colors.ink }]} accessibilityRole="header">Welcome to Skyline Pulse</Text>
        <Text style={[styles.heroText, { color: colors.muted }]}>See how service actually went — logged in under a minute.</Text>
      </View>

      {error ? <Banner>{error}</Banner> : null}

      {todo.map(t => (
        <Pressable key={t.label} accessibilityRole="button" onPress={() => router.push(t.href)}
          style={({ pressed }) => [styles.todo, { borderColor: colors.brass, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}>
          <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>
            {t.n} {t.label} {t.n === 1 ? 'plan needs' : 'plans need'} details
          </Text>
          <Text style={{ color: colors.brass, fontWeight: '700' }}>Log now ›</Text>
        </Pressable>
      ))}

      <View style={styles.grid}>
        <Tile label="Services Logged" value={count(summary.sundayCount)} />
        <Tile label="SkyYouth Logged" value={count(summary.youthCount)} />
        <Tile label="Production Logged" value={count(summary.productionCount)} />
        <Tile label="Upcoming Plans" value={plans.loading && !plans.rows.length ? '…' : String(summary.upcomingPlans)} />
        <Tile label="Serving — Responded" value={serving ? String(serving.responded) : '—'} />
        <Tile label="Serving — Needs Response" value={serving ? String(serving.needs_response) : '—'} />
      </View>
      {serving ? (
        <Text style={[styles.note, { color: colors.muted }]}>
          {serving.responded} responded + {serving.needs_response} awaiting response = {serving.total_signups} total serving signup{serving.total_signups === 1 ? '' : 's'} in the next 3 weeks
        </Text>
      ) : null}

      {summary.avgAttendance != null ? (
        <View style={styles.grid}>
          <Tile label="Avg Attendance" value={summary.avgAttendance.toFixed(0)} />
          <Tile label="Avg Unity" value={summary.avgUnity!.toFixed(1)} suffix="/5" />
          <Tile label="Avg Engagement" value={summary.avgEngagement!.toFixed(1)} suffix="/5" />
        </View>
      ) : null}

      {trend.length >= 2 ? <Section title="Attendance Trend"><AttendanceChart points={trend} /></Section> : null}

      {HOME_CARDS.map(card => {
        const available = !!card.href;
        const countText = available ? (loading && card.key !== 'serving' ? 'Loading…' : cardCount(card.key, summary, serving)) : 'Coming soon to the app';
        return (
          <Pressable key={card.key} disabled={!available} accessibilityRole="button" accessibilityState={{ disabled: !available }}
            accessibilityHint={available ? `Opens ${card.title}` : 'Available on the website for now'}
            onPress={() => card.href && router.push(card.href)}
            style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: pressed ? colors.pew : colors.line, opacity: available ? 1 : 0.55 }]}>
            <Text style={styles.cardIcon}>{card.icon}</Text>
            <Text style={[styles.cardTitle, { color: colors.ink }]}>{card.title}</Text>
            <Text style={[styles.cardDesc, { color: colors.muted }]}>{card.desc}</Text>
            {countText ? <Text style={[styles.cardCount, { color: colors.brass }]}>{countText}</Text> : null}
          </Pressable>
        );
      })}

      {recent.length ? (
        <Section title="Recently Logged">
          {recent.map(item => (
            <Pressable key={`${item.kind}-${item.id}`} accessibilityRole="button" accessibilityHint="Opens this entry"
              onPress={() => router.push({ pathname: item.kind === 'Service' ? '/service-form' : '/production-form', params: { id: item.id } })}
              style={[styles.recentRow, { borderTopColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>
                {item.serviceType} <Text style={{ color: colors.muted, fontWeight: '400' }}>· {item.kind}</Text>
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{formatDate(item.date)}{item.loggedBy ? ` · ${item.loggedBy}` : ''}</Text>
            </Pressable>
          ))}
        </Section>
      ) : !hasAnyData && !loading && !error ? (
        <Section title="Nothing logged yet — let's fix that.">
          <Text style={{ color: colors.muted }}>Head into Sunday Services and log this week's numbers to get started.</Text>
        </Section>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  logo: { width: '70%', height: 44, alignSelf: 'flex-start' },
  hero: { borderWidth: 1, borderRadius: 10, padding: 20, gap: 6 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  heroTitle: { fontFamily: DISPLAY, fontSize: 26, fontWeight: '600' },
  heroText: { fontSize: 15, lineHeight: 21 },
  todo: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 10, padding: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: '45%', borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  tileLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  tileValue: { fontSize: 24, fontWeight: '700' },
  tileSuffix: { fontSize: 14, fontWeight: '400' },
  note: { fontSize: 13, lineHeight: 18 },
  section: { borderWidth: 1, borderRadius: 10, padding: 16, gap: 10 },
  sectionTitle: { fontFamily: DISPLAY, fontSize: 18, fontWeight: '600' },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 170 },
  barColumn: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  barValue: { fontSize: 11, fontWeight: '600' },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabel: { fontSize: 10 },
  card: { borderWidth: 1, borderRadius: 10, padding: 16, gap: 4 },
  cardIcon: { fontSize: 24, marginBottom: 4 },
  cardTitle: { fontFamily: DISPLAY, fontSize: 17, fontWeight: '600' },
  cardDesc: { fontSize: 13, lineHeight: 18 },
  cardCount: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 6 },
  recentRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 2 },
});
