import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { Stack } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from './ThemeContext.tsx';
import { nameSuggestions } from './logging.ts';

// Scrolling form page that stays clear of the keyboard and sets the header title.
export function FormScreen({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.paper }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.fieldLabel }]}>{label}</Text>
      {children}
      {hint ? <Text style={[styles.hint, { color: colors.muted }]}>{hint}</Text> : null}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[styles.section, { color: colors.brass, borderBottomColor: colors.line }]}>{children}</Text>;
}

type Option<T> = { value: T; label: string };
export function Chips<T extends string | number | boolean>({ options, value, onChange, disabled, accessibilityLabel }: {
  options: Option<T>[]; value: T; onChange: (value: T) => void; disabled?: boolean; accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[styles.chip, { borderColor: selected ? colors.brass : colors.line, backgroundColor: selected ? colors.brassSoft : colors.surface, opacity: disabled && !selected ? 0.4 : 1 }]}>
            <Text style={{ color: colors.ink, fontWeight: selected ? '700' : '400' }}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// A row of tappable numbers stands in for the website's sliders: easier to hit exactly on a phone.
export function Scale({ min, max, value, onChange, label }: { min: number; max: number; value: number; onChange: (value: number) => void; label: string }) {
  const options = Array.from({ length: max - min + 1 }, (_, i) => ({ value: min + i, label: String(min + i) }));
  return <Field label={`${label} — ${value}/${max}`}><Chips options={options} value={value} onChange={onChange} accessibilityLabel={label} /></Field>;
}

const YES_NO: Option<boolean>[] = [{ value: true, label: 'Yes' }, { value: false, label: 'No' }];
export function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <Field label={label}><Chips options={YES_NO} value={value} onChange={onChange} accessibilityLabel={label} /></Field>;
}

export function Input({ value, onChangeText, placeholder, keyboardType, multiline, accessibilityLabel }: {
  value: string; onChangeText: (text: string) => void; placeholder?: string; keyboardType?: KeyboardTypeOptions; multiline?: boolean; accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      keyboardType={keyboardType}
      multiline={multiline}
      accessibilityLabel={accessibilityLabel}
      autoCorrect={!!multiline}
      style={[styles.input, multiline && styles.multiline, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.surface }]}
    />
  );
}

// Text input with tappable earlier names, standing in for the website's datalist.
export function NameInput({ value, onChangeText, names, placeholder, accessibilityLabel }: {
  value: string; onChangeText: (text: string) => void; names: Array<string | null | undefined>; placeholder?: string; accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const suggestions = nameSuggestions(names, value);
  return (
    <View style={{ gap: 6 }}>
      <Input value={value} onChangeText={onChangeText} placeholder={placeholder} accessibilityLabel={accessibilityLabel} />
      {suggestions.length ? (
        <View style={styles.chips}>
          {suggestions.map(name => (
            <Pressable key={name} accessibilityRole="button" accessibilityLabel={`Use ${name}`} onPress={() => onChangeText(name)}
              style={[styles.suggestion, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>{name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const toDate = (value: string) => { const [y, m, d] = value.split('-').map(Number); return new Date(y, m - 1, d); };
const toValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function DateInput({ value, onChange, maximum, label }: { value: string; onChange: (value: string) => void; maximum: string; label: string }) {
  const { colors, theme } = useTheme();
  const [open, setOpen] = useState(false);
  const picker = (
    <DateTimePicker
      value={toDate(value)}
      mode="date"
      maximumDate={toDate(maximum)}
      display={Platform.OS === 'ios' ? 'compact' : 'default'}
      themeVariant={theme === 'light' ? 'light' : 'dark'}
      accessibilityLabel={label}
      onChange={(event, date) => {
        setOpen(false);
        if (event.type === 'set' && date) onChange(toValue(date));
      }}
    />
  );
  // iOS shows a compact inline control; Android opens a dialog from a button.
  if (Platform.OS === 'ios') return <View style={{ alignItems: 'flex-start' }}>{picker}</View>;
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}. Change date`} onPress={() => setOpen(true)}
        style={[styles.input, { borderColor: colors.line, backgroundColor: colors.surface }]}>
        <Text style={{ color: colors.ink }}>{value}</Text>
      </Pressable>
      {open ? picker : null}
    </>
  );
}

const styles = StyleSheet.create({
  form: { padding: 16, paddingBottom: 40, gap: 14 },
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 13, lineHeight: 18 },
  section: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, paddingBottom: 4, borderBottomWidth: 1, marginTop: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, minWidth: 44, minHeight: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  suggestion: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
});
