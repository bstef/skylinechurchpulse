import { RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../../src/DataContext.tsx';
import { useTheme } from '../../src/ThemeContext.tsx';
import { PlansSection, ServiceEntryCard } from '../../src/lists.tsx';
import { Banner, Body, Button, Heading, Screen } from '../../src/ui.tsx';

const RECENT = 20;

// SkyYouth's own plans and entries, split out by Planning Center Service Type as on the website.
export default function SkyYouth() {
  const { colors } = useTheme();
  const { services, plans, refreshAll } = useData();
  const recent = services.rows.filter(entry => entry.service_type === 'SkyYouth').slice(0, RECENT);
  return (
    <Screen refreshControl={<RefreshControl refreshing={services.loading || plans.loading} onRefresh={refreshAll} tintColor={colors.brass} />}>
      <Button label="Log a service" onPress={() => router.push({ pathname: '/service-form', params: { service: 'SkyYouth' } })} />
      <PlansSection youth />
      <Heading>Recent SkyYouth entries</Heading>
      {services.error ? <Banner>{services.error}</Banner> : null}
      {!services.loading && !services.error && recent.length === 0 ? <Body muted>No SkyYouth services logged yet.</Body> : null}
      {recent.map(entry => <ServiceEntryCard key={entry.id} entry={entry} />)}
    </Screen>
  );
}
