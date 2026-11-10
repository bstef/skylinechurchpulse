import { RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../../src/DataContext.tsx';
import { useTheme } from '../../src/ThemeContext.tsx';
import { PlansSection, ServiceEntryCard } from '../../src/lists.tsx';
import { Banner, Body, Button, Heading, Screen } from '../../src/ui.tsx';

const RECENT = 20;

export default function Services() {
  const { colors } = useTheme();
  const { services, plans, refreshAll } = useData();
  const recent = services.rows.filter(entry => entry.service_type !== 'SkyYouth').slice(0, RECENT);
  return (
    <Screen refreshControl={<RefreshControl refreshing={services.loading || plans.loading} onRefresh={refreshAll} tintColor={colors.brass} />}>
      <Button label="Log a service" onPress={() => router.push('/service-form')} />
      <PlansSection youth={false} />
      <Heading>Recent entries</Heading>
      {services.error ? <Banner>{services.error}</Banner> : null}
      {!services.loading && !services.error && recent.length === 0 ? <Body muted>No services logged yet.</Body> : null}
      {recent.map(entry => <ServiceEntryCard key={entry.id} entry={entry} />)}
    </Screen>
  );
}
