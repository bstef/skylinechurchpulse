import { RefreshControl } from 'react-native';
import { useTable, type ProductionEntry } from '../../src/useTable.ts';
import { useTheme } from '../../src/ThemeContext.tsx';
import { Banner, Body, Card, Heading, Screen } from '../../src/ui.tsx';

const RECENT = 20;
const ROLES = ['lights', 'camera', 'director', 'computer', 'audio'] as const;

// Read-only for now; logging production arrives in phase 3.
export default function Production() {
  const { colors } = useTheme();
  const { rows, error, loading, refresh } = useTable<ProductionEntry>('production_entries');
  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.brass} />}>
      {error ? <Banner>{error}</Banner> : null}
      {!loading && !error && rows.length === 0 ? <Body muted>No production entries logged yet.</Body> : null}
      {rows.slice(0, RECENT).map(entry => {
        const covered = ROLES.filter(role => entry[`${role}_present`]).length;
        return (
          <Card key={entry.id}>
            <Heading>{entry.service_date} · {entry.service_type}</Heading>
            <Body>Roles covered {covered}/{ROLES.length} · Slides {entry.slides_grade}/4 · {entry.slides_miss_count} missed cues</Body>
          </Card>
        );
      })}
    </Screen>
  );
}
