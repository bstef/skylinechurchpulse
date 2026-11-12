import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from './AuthContext.tsx';
import { useLock } from './LockContext.tsx';
import { useTheme } from './ThemeContext.tsx';
import { Banner, Body, Button, Heading } from './ui.tsx';

const LOGO_LIGHT = require('../assets/logo-light.png');
const LOGO_DARK = require('../assets/logo-dark.png');

// Shown instead of the app while it's locked. Asks for Face ID straight away.
export function LockScreen() {
  const { theme, colors } = useTheme();
  const { email, signOut } = useAuth();
  const { unlock, label } = useLock();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function tryUnlock() {
    setBusy(true);
    setError(await unlock());
    setBusy(false);
  }
  useEffect(() => { tryUnlock(); }, []);

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.paper }]}>
      <View style={styles.content}>
        <Image source={theme === 'light' ? LOGO_LIGHT : LOGO_DARK} style={styles.logo} resizeMode="contain" accessibilityLabel="Skyline Pulse" />
        <Heading>Skyline Pulse is locked</Heading>
        {email ? <Body muted>Signed in as {email}</Body> : null}
        {error ? <Banner>{error}</Banner> : null}
        <Button label={`Unlock with ${label}`} onPress={tryUnlock} busy={busy} />
        <Button label="Sign out" variant="secondary" onPress={signOut} disabled={busy} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  logo: { width: '100%', height: 64, marginBottom: 8 },
});
