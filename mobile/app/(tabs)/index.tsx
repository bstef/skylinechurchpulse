import { RefreshControl } from 'react-native';
import { useTable, type ProductionEntry, type ServiceEntry } from '../../src/useTable.ts';
import { useTheme } from '../../src/ThemeContext.tsx';
import { Banner, Body, Card, Heading, Screen } from '../../src/ui.tsx';

export default function Home() {
  const { colors } = useTheme();
  const services = useTable<ServiceEntry>('service_entries');
  const production = useTable<ProductionEntry>('production_entries');
  const loading = services.loading || production.loading;
  const error = services.error || production.error;
  const refresh = () => { services.refresh(); production.refresh(); };

  // Same split as the website: SkyYouth services have their own section.
  const sunday = services.rows.filter(entry => entry.service_type !== 'SkyYouth');
  const youth = services.rows.filter(entry => entry.service_type === 'SkyYouth');
  const latest = sunday[0];

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.brass} />}>
      {error ? <Banner>{error}</Banner> : null}
      <Card>
        <Heading>🗓️ Sunday Services</Heading>
        <Body muted>{loading ? 'Loading…' : `${sunday.length} logged`}</Body>
        {latest ? <Body>Latest: {latest.service_date} · {latest.service_type} · {latest.attendance} attending</Body> : null}
      </Card>
      <Card>
        <Heading>🎛️ Production</Heading>
        <Body muted>{loading ? 'Loading…' : `${production.rows.length} logged`}</Body>
      </Card>
      <Card>
        <Heading>🎧 SkyYouth</Heading>
        <Body muted>{loading ? 'Loading…' : `${youth.length} logged`}</Body>
      </Card>
    </Screen>
  );
}
