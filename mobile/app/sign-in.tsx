import { Image, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/AuthContext.tsx';
import { useTheme } from '../src/ThemeContext.tsx';
import { Banner, Body, Button, Card } from '../src/ui.tsx';

const LOGO_LIGHT = require('../assets/logo-light.png');
const LOGO_DARK = require('../assets/logo-dark.png');

const STEPS = [
  'Your phone asks to use cloudflareaccess.com to sign in. Tap Continue.',
  'Enter your church email, then the code we email you.',
  "You're back here, signed in. After this, Face ID opens the app.",
];

export default function SignIn() {
  const { theme, colors } = useTheme();
  const { signIn, busy, error } = useAuth();
  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.paper }]}>
      <View style={styles.content}>
        <Image source={theme === 'light' ? LOGO_LIGHT : LOGO_DARK} style={styles.logo} resizeMode="contain" accessibilityLabel="Skyline Pulse" />
        <Body muted>A clearer picture of every gathering at Skyline Church NJ.</Body>
        <Card>
          {STEPS.map((step, index) => (
            <View key={step} style={styles.step}>
              <Text style={[styles.number, { color: colors.paper, backgroundColor: colors.brass }]}>{index + 1}</Text>
              <View style={{ flex: 1 }}><Body>{step}</Body></View>
            </View>
          ))}
        </Card>
        {error ? <Banner>{error}</Banner> : null}
        <Button label={busy ? 'Waiting for sign-in…' : 'Sign in with email'} onPress={signIn} busy={busy} />
        <Body muted>Use the same email you use for the Skyline Pulse website.</Body>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  logo: { width: '100%', height: 64, marginBottom: 8 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  number: { width: 24, height: 24, borderRadius: 12, textAlign: 'center', lineHeight: 24, fontWeight: '700', overflow: 'hidden' },
});
