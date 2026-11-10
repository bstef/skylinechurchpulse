import { RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useData } from '../../src/DataContext.tsx';
import { useTheme } from '../../src/ThemeContext.tsx';
import { ProductionEntryCard } from '../../src/lists.tsx';
import { Banner, Body, Button, Screen } from '../../src/ui.tsx';

const RECENT = 20;

export default function Production() {
  const { colors } = useTheme();
  const { production, refreshAll } = useData();
  return (
    <Screen refreshControl={<RefreshControl refreshing={production.loading} onRefresh={refreshAll} tintColor={colors.brass} />}>
      <Button label="Log production" onPress={() => router.push('/production-form')} />
      {production.error ? <Banner>{production.error}</Banner> : null}
      {!production.loading && !production.error && production.rows.length === 0 ? <Body muted>No production entries logged yet.</Body> : null}
      {production.rows.slice(0, RECENT).map(entry => <ProductionEntryCard key={entry.id} entry={entry} />)}
    </Screen>
  );
}
