import { RefreshControl } from 'react-native';
import { useTable, type ServiceEntry } from '../../src/useTable.ts';
import { useTheme } from '../../src/ThemeContext.tsx';
import { Banner, Body, Card, Heading, Screen } from '../../src/ui.tsx';

const RECENT = 20;

// Read-only for now; logging and editing services arrive in phase 3.
export default function Services() {
  const { colors } = useTheme();
  const { rows, error, loading, refresh } = useTable<ServiceEntry>('service_entries');
  const recent = rows.filter(entry => entry.service_type !== 'SkyYouth').slice(0, RECENT);
  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.brass} />}>
      {error ? <Banner>{error}</Banner> : null}
      {!loading && !error && recent.length === 0 ? <Body muted>No services logged yet.</Body> : null}
      {recent.map(entry => (
        <Card key={entry.id}>
          <Heading>{entry.service_date} · {entry.service_type}</Heading>
          <Body>{entry.attendance} attending · Unity {entry.unity}/5 · Engagement {entry.engagement}/5</Body>
          {entry.notes ? <Body muted>{entry.notes}</Body> : null}
        </Card>
      ))}
    </Screen>
  );
}
