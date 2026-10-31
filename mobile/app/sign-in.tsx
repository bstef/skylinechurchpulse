import { Image, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/AuthContext.tsx';
import { useTheme } from '../src/ThemeContext.tsx';
import { Banner, Body, Button } from '../src/ui.tsx';

const LOGO_LIGHT = require('../assets/logo-light.png');
const LOGO_DARK = require('../assets/logo-dark.png');

export default function SignIn() {
  const { theme, colors } = useTheme();
  const { signIn, busy, error } = useAuth();
  return (
    <SafeAreaView style={[styles.page, { backgroundColor: colors.paper }]}>
      <View style={styles.content}>
        <Image source={theme === 'light' ? LOGO_LIGHT : LOGO_DARK} style={styles.logo} resizeMode="contain" accessibilityLabel="Skyline Pulse" />
        <Body muted>A clearer picture of every gathering at Skyline Church NJ.</Body>
        {error ? <Banner>{error}</Banner> : null}
        <Button label="Sign in" onPress={signIn} busy={busy} />
        <Body muted>You'll sign in with the same account you use for the Skyline Pulse website.</Body>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  logo: { width: '100%', height: 64, marginBottom: 8 },
});
