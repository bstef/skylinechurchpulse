import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../src/AuthContext.tsx';
import { useTheme } from '../../src/ThemeContext.tsx';
import { config } from '../../src/config.ts';
import { THEME_LABELS, THEMES } from '../../src/theme.ts';
import { Body, Button, Card, Heading, Screen } from '../../src/ui.tsx';

export default function More() {
  const { theme, colors, setTheme } = useTheme();
  const { email, signOut } = useAuth();
  return (
    <Screen>
      <Card>
        <Heading>Appearance</Heading>
        <View style={styles.row}>
          {THEMES.map(name => {
            const selected = name === theme;
            return (
              <Pressable
                key={name}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => setTheme(name)}
                style={[styles.chip, { borderColor: selected ? colors.brass : colors.line, backgroundColor: selected ? colors.brassSoft : 'transparent' }]}>
                <Text style={{ color: colors.ink, fontWeight: selected ? '700' : '400' }}>{THEME_LABELS[name]}</Text>
              </Pressable>
            );
          })}
        </View>
      </Card>
      <Card>
        <Heading>Coming soon</Heading>
        <Body muted>SkyYouth, Planning Center responses, Analytics and Exports are on the website for now and arrive in the app in later phases.</Body>
      </Card>
      <Card>
        <Heading>Account</Heading>
        <Body>{email ? `Signed in as ${email}` : 'Signed in'}</Body>
        <Body muted>Server: {config.apiBase.replace(/^https?:\/\//, '')}</Body>
      </Card>
      <Button label="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
});
