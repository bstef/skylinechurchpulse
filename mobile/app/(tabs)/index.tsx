import { Pressable, RefreshControl } from 'react-native';
import { router, type Href } from 'expo-router';
import { useData } from '../../src/DataContext.tsx';
import { useTheme } from '../../src/ThemeContext.tsx';
import { isSkyYouthPlan, localDate, planStatus } from '../../src/logging.ts';
import { Banner, Body, Card, Heading, Screen } from '../../src/ui.tsx';

function Tile({ href, children }: { href: Href; children: React.ReactNode }) {
  return <Pressable accessibilityRole="button" onPress={() => router.push(href)}>{children}</Pressable>;
}

export default function Home() {
  const { colors } = useTheme();
  const { services, production, plans, refreshAll } = useData();
  const loading = services.loading || production.loading;
  const error = services.error || production.error;
  const today = localDate();

  // Same split as the website: SkyYouth services have their own section.
  const sunday = services.rows.filter(entry => entry.service_type !== 'SkyYouth');
  const youth = services.rows.filter(entry => entry.service_type === 'SkyYouth');
  const needsDetails = (youthPlans: boolean) => plans.rows.filter(p => isSkyYouthPlan(p) === youthPlans && planStatus(p, services.rows, today) === 'needs-details').length;
  const latest = sunday[0];
  const count = (n: number) => loading ? 'Loading…' : `${n} logged`;
  const todo = (n: number) => n ? `${n} Planning Center ${n === 1 ? 'plan needs' : 'plans need'} details` : null;

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading || plans.loading} onRefresh={refreshAll} tintColor={colors.brass} />}>
      {error ? <Banner>{error}</Banner> : null}
      <Tile href="/services">
        <Card>
          <Heading>🗓️ Sunday Services</Heading>
          <Body muted>{count(sunday.length)}</Body>
          {todo(needsDetails(false)) ? <Body>{todo(needsDetails(false))}</Body> : null}
          {latest ? <Body muted>Latest: {latest.service_date} · {latest.service_type} · {latest.attendance} attending</Body> : null}
        </Card>
      </Tile>
      <Tile href="/production">
        <Card>
          <Heading>🎛️ Production</Heading>
          <Body muted>{count(production.rows.length)}</Body>
        </Card>
      </Tile>
      <Tile href="/skyyouth">
        <Card>
          <Heading>🎧 SkyYouth</Heading>
          <Body muted>{count(youth.length)}</Body>
          {todo(needsDetails(true)) ? <Body>{todo(needsDetails(true))}</Body> : null}
        </Card>
      </Tile>
    </Screen>
  );
}
