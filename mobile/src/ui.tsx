import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type RefreshControlProps, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from './ThemeContext.tsx';

export function Screen({ children, refreshControl }: { children: ReactNode; refreshControl?: React.ReactElement<RefreshControlProps> }) {
  const { colors } = useTheme();
  return (
    <ScrollView style={{ backgroundColor: colors.paper }} contentContainerStyle={styles.screen} refreshControl={refreshControl}>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, style]}>{children}</View>;
}

export function Heading({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <Text style={[styles.heading, { color: colors.ink }]}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const { colors } = useTheme();
  return <Text style={[styles.body, { color: muted ? colors.muted : colors.ink }]}>{children}</Text>;
}

export function Banner({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return <View style={[styles.banner, { backgroundColor: colors.bannerBg }]}><Text style={{ color: colors.rust }}>{children}</Text></View>;
}

export function Button({ label, onPress, disabled, busy, variant = 'primary' }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; variant?: 'primary' | 'secondary' }) {
  const { colors } = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.button, {
        backgroundColor: primary ? colors.brass : 'transparent',
        borderColor: primary ? colors.brass : colors.line,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      }]}>
      {busy ? <ActivityIndicator color={primary ? colors.paper : colors.ink} /> : <Text style={[styles.buttonText, { color: primary ? colors.paper : colors.ink }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 6 },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  banner: { borderRadius: 10, padding: 12 },
  button: { borderWidth: 1, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
