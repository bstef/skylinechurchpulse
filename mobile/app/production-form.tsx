import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useData } from '../src/DataContext.tsx';
import { useTheme } from '../src/ThemeContext.tsx';
import { useDraftForm } from '../src/useDraftForm.ts';
import { draftKey } from '../src/drafts.ts';
import { Chips, DateInput, Field, FormScreen, Input, NameInput, SectionLabel, YesNo } from '../src/form.tsx';
import { Banner, Body, Button, Card } from '../src/ui.tsx';
import {
  LOGGED_BY_KEY, localDate, PRODUCTION_ROLES, productionDefaults, productionPayload, SERVICE_TYPES, SLIDES_GRADE_LABELS, validateProduction,
  type ProductionForm, type RoleKey,
} from '../src/logging.ts';

const GRADES = [1, 2, 3, 4].map(g => ({ value: g, label: SLIDES_GRADE_LABELS[g] }));

// Log production for a service, or edit an existing log (?id=).
export default function ProductionFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { colors } = useTheme();
  const { services, production, save, remove } = useData();
  const entry = id ? production.rows.find(e => e.id === id) ?? null : null;
  const today = localDate();
  const [savedLoggedBy, setSavedLoggedBy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { AsyncStorage.getItem(LOGGED_BY_KEY).then(name => setSavedLoggedBy(name ?? '')).catch(() => setSavedLoggedBy('')); }, []);

  const ready = savedLoggedBy !== null && (!id || entry);
  const initial = useMemo(() => ready ? productionDefaults(entry, savedLoggedBy!, today) : null, [ready, entry, savedLoggedBy, today]);
  const { values: form, update, restored, discard, forget } = useDraftForm<ProductionForm>(draftKey('production', { entryId: id }), initial);

  const editing = !!entry;
  const title = editing ? 'Edit Production Log' : 'Log Production';
  if (!form) {
    return <FormScreen title={title}>{id && !production.loading && !entry ? <Banner>That log is no longer available. Go back and refresh.</Banner> : <Body muted>Loading…</Body>}</FormScreen>;
  }

  const set = <K extends keyof ProductionForm>(key: K) => (value: ProductionForm[K]) => update({ [key]: value } as Partial<ProductionForm>);
  const setRole = (key: RoleKey, patch: Partial<ProductionForm['roles'][RoleKey]>) => update({ roles: { ...form.roles, [key]: { ...form.roles[key], ...patch } } });
  const loggedByNames = [...services.rows, ...production.rows].map(e => e.logged_by);

  async function submit() {
    const problem = validateProduction(form!, today);
    if (problem) { setError(problem); return; }
    setBusy(true);
    const payload = productionPayload(form!);
    const failure = await save('production_entries', payload, entry?.id);
    setBusy(false);
    if (failure) { setError(failure); return; }
    await AsyncStorage.setItem(LOGGED_BY_KEY, String(payload.logged_by)).catch(() => {});
    await forget();
    router.back();
  }

  function confirmDelete() {
    Alert.alert('Delete this production log?', `${entry!.service_date} · ${entry!.service_type}. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusy(true);
        const failure = await remove('production_entries', entry!.id);
        setBusy(false);
        if (failure) { setError(failure); return; }
        await forget();
        router.back();
      } },
    ]);
  }

  return (
    <FormScreen title={title}>
      {restored ? <Card><Body>Restored your unsaved changes.</Body><Button label="Discard draft" variant="secondary" onPress={discard} /></Card> : null}
      <Field label="Date"><DateInput value={form.date} onChange={set('date')} maximum={today} label="Date" /></Field>
      <Field label="Service *">
        <Chips options={SERVICE_TYPES.map(s => ({ value: s, label: s }))} value={form.service} onChange={set('service')} accessibilityLabel="Service" />
      </Field>

      <SectionLabel>Role Attendance</SectionLabel>
      {PRODUCTION_ROLES.map(({ key, label }) => (
        <View key={key} style={[styles.role, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          <Text style={[styles.roleName, { color: colors.ink }]}>{label}</Text>
          <Chips options={[{ value: true, label: 'Present' }, { value: false, label: 'Missing' }]} value={form.roles[key].present}
            onChange={present => setRole(key, { present })} accessibilityLabel={`${label} attendance`} />
          <NameInput value={form.roles[key].name} onChangeText={name => setRole(key, { name })}
            names={production.rows.map(e => e[`${key}_name`])} placeholder="Who?" accessibilityLabel={`${label} person`} />
        </View>
      ))}

      <SectionLabel>Fit Checks</SectionLabel>
      <Field label="Slides grade"><Chips options={GRADES} value={form.slidesGrade} onChange={set('slidesGrade')} accessibilityLabel="Slides grade" /></Field>
      <Field label="Slide misses" hint="What's a miss? Slides shown at the wrong time. Missed cues on videos and text slides. Lyric slides that change too slowly — should advance on the 2nd-to-last word.">
        <Input value={form.slidesMisses} onChangeText={set('slidesMisses')} keyboardType="number-pad" accessibilityLabel="Slide misses" />
      </Field>
      <YesNo label="Camera work/direction was on point" value={form.cameraDirection} onChange={set('cameraDirection')} />

      <Field label="Notes (optional)">
        <Input value={form.notes} onChangeText={set('notes')} placeholder="Anything else worth noting…" multiline accessibilityLabel="Notes" />
      </Field>
      <Field label="Logged by *">
        <NameInput value={form.loggedBy} onChangeText={set('loggedBy')} names={loggedByNames} placeholder="Your name" accessibilityLabel="Logged by" />
      </Field>

      {error ? <Banner>{error}</Banner> : null}
      <Button label={editing ? 'Update Log' : 'Save Log'} onPress={submit} busy={busy} />
      {editing ? <View style={styles.danger}><Button label="Delete log" variant="secondary" onPress={confirmDelete} disabled={busy} /></View> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  role: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  roleName: { fontSize: 15, fontWeight: '700' },
  danger: { marginTop: 8 },
});
