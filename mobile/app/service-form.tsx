import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useData } from '../src/DataContext.tsx';
import { useDraftForm } from '../src/useDraftForm.ts';
import { draftKey } from '../src/drafts.ts';
import { Chips, DateInput, Field, FormScreen, Input, NameInput, Scale, SectionLabel, YesNo } from '../src/form.tsx';
import { Banner, Body, Button, Card } from '../src/ui.tsx';
import {
  LOGGED_BY_KEY, localDate, pcoAttendanceFor, serviceDefaults, serviceLocked, servicePayload, SERVICE_TYPES, validateService, type ServiceForm,
} from '../src/logging.ts';

// Log a service (optionally for a Planning Center plan via ?planId=) or edit one (?id=).
export default function ServiceFormScreen() {
  const { id, planId } = useLocalSearchParams<{ id?: string; planId?: string }>();
  const { services, plans, save, remove } = useData();
  const entry = id ? services.rows.find(e => e.id === id) ?? null : null;
  const plan = !id && planId ? plans.rows.find(p => p.id === planId) ?? null : null;
  const context = useMemo(() => ({ entry, plan }), [entry, plan]);
  const today = localDate();
  const [savedLoggedBy, setSavedLoggedBy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { AsyncStorage.getItem(LOGGED_BY_KEY).then(name => setSavedLoggedBy(name ?? '')).catch(() => setSavedLoggedBy('')); }, []);

  // Wait until the entry or plan this form is for has loaded.
  const ready = savedLoggedBy !== null && (!id || entry) && (!planId || id || plan);
  const initial = useMemo(() => ready ? serviceDefaults(context, savedLoggedBy!, today) : null, [ready, context, savedLoggedBy, today]);
  const { values: form, update, restored, discard, forget } = useDraftForm<ServiceForm>(draftKey('service', { entryId: id, planId }), initial);

  const editing = !!entry;
  const title = editing ? 'Edit Service' : 'Log a Service';
  if (!form) {
    const missing = (id && !services.loading && !entry) || (planId && !id && !plans.loading && !plan);
    return <FormScreen title={title}>{missing ? <Banner>That entry or plan is no longer available. Go back and refresh.</Banner> : <Body muted>Loading…</Body>}</FormScreen>;
  }

  const locked = serviceLocked(context);
  const pcoAttendance = pcoAttendanceFor(context);
  const set = <K extends keyof ServiceForm>(key: K) => (value: ServiceForm[K]) => update({ [key]: value } as Partial<ServiceForm>);

  async function submit() {
    const problem = validateService(form!, today);
    if (problem) { setError(problem); return; }
    setBusy(true);
    const payload = servicePayload(form!, context);
    const failure = await save('service_entries', payload, entry?.id);
    setBusy(false);
    if (failure) { setError(failure); return; }
    await AsyncStorage.setItem(LOGGED_BY_KEY, payload.logged_by).catch(() => {});
    await forget();
    router.back();
  }

  function confirmDelete() {
    Alert.alert('Delete this service?', `${entry!.service_date} · ${entry!.service_type}. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setBusy(true);
        const failure = await remove('service_entries', entry!.id);
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
      {plan ? <Card><Body muted>From Planning Center</Body><Body>{plan.title}{plan.plan_time_name ? ` · ${plan.plan_time_name}` : ''}</Body></Card> : null}

      <Field label="Date"><DateInput value={form.date} onChange={set('date')} maximum={today} label="Date" /></Field>
      <Field label="Service *" hint={locked ? 'Set by the Planning Center plan.' : undefined}>
        <Chips options={SERVICE_TYPES.map(s => ({ value: s, label: s }))} value={form.service} onChange={set('service')} disabled={locked} accessibilityLabel="Service" />
      </Field>
      <Field label="Attendance (headcount)" hint={pcoAttendance != null ? (Number(form.attendance) === pcoAttendance ? 'From Planning Center Check-Ins.' : `Overridden. Planning Center counted ${pcoAttendance}.`) : undefined}>
        <Input value={form.attendance} onChangeText={set('attendance')} placeholder="e.g. 214" keyboardType="number-pad" accessibilityLabel="Attendance" />
      </Field>
      <Scale label="Oneness in One Voice (worship unity)" min={1} max={5} value={form.unity} onChange={set('unity')} />
      <Scale label="Audience Engagement" min={1} max={5} value={form.engagement} onChange={set('engagement')} />
      <Field label="Loudness (dB)">
        <Input value={form.loudness} onChangeText={set('loudness')} placeholder="e.g. 92" keyboardType="number-pad" accessibilityLabel="Loudness in decibels" />
      </Field>

      <SectionLabel>Room Experience</SectionLabel>
      <YesNo label="Sound blends well in the back (can't tell where it's coming from)" value={form.soundClarity} onChange={set('soundClarity')} />
      <Scale label="Spiritual response, standing 2/3 back" min={0} max={10} value={form.spiritualResponse} onChange={set('spiritualResponse')} />

      <SectionLabel>Production</SectionLabel>
      <YesNo label="Lighting fit the song" value={form.lightingFit} onChange={set('lightingFit')} />
      <YesNo label="Sermon/message connected" value={form.sermonFit} onChange={set('sermonFit')} />

      <SectionLabel>Hosts</SectionLabel>
      <Field label="Host / Speaker name">
        <NameInput value={form.hostName} onChangeText={set('hostName')} names={services.rows.map(e => e.host_name)} placeholder="Who hosted?" accessibilityLabel="Host or speaker name" />
      </Field>
      <Scale label="Intro felt welcoming and inviting" min={1} max={5} value={form.introWelcoming} onChange={set('introWelcoming')} />
      <Scale label="Transitions gave clear inspiration to respond" min={1} max={5} value={form.transitionClarity} onChange={set('transitionClarity')} />
      <YesNo label="Talking/host segments flowed well" value={form.talkingFit} onChange={set('talkingFit')} />
      <YesNo label="Announcements landed well" value={form.announcementsFit} onChange={set('announcementsFit')} />

      <Field label="Notes (optional)">
        <Input value={form.notes} onChangeText={set('notes')} placeholder="Anything worth remembering about this service…" multiline accessibilityLabel="Notes" />
      </Field>
      <Field label="Logged by *">
        <NameInput value={form.loggedBy} onChangeText={set('loggedBy')} names={services.rows.map(e => e.logged_by)} placeholder="Your name" accessibilityLabel="Logged by" />
      </Field>

      {error ? <Banner>{error}</Banner> : null}
      <Button label={editing ? 'Update Entry' : 'Save Entry'} onPress={submit} busy={busy} />
      {editing ? <View style={styles.danger}><Button label="Delete entry" variant="secondary" onPress={confirmDelete} disabled={busy} /></View> : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  danger: { marginTop: 8 },
});
