import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { ThemeProvider, useTheme } from '../src/ThemeContext.tsx';
import { AuthProvider, useAuth } from '../src/AuthContext.tsx';
import { DataProvider } from '../src/DataContext.tsx';
import { LockProvider, useLock } from '../src/LockContext.tsx';
import { LockScreen } from '../src/LockScreen.tsx';
import { isDarkTheme } from '../src/theme.ts';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigator() {
  const { theme, colors, ready } = useTheme();
  const { status } = useAuth();
  const lock = useLock();
  // Wait for the lock decision too, so a saved sign-in never flashes church data before Face ID.
  const loading = !ready || status === 'loading' || !lock.ready;

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.paper).catch(() => {});
  }, [colors.paper]);
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);
  if (loading) return null;
  if (lock.locked) return <><StatusBar style={isDarkTheme(theme) ? 'light' : 'dark'} /><LockScreen /></>;
  const pushed = { headerShown: true, headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.ink, headerShadowVisible: false };

  return (
    <>
      <StatusBar style={isDarkTheme(theme) ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Protected guard={status === 'signed-in'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="skyyouth" options={pushed} />
          <Stack.Screen name="service-form" options={{ ...pushed, presentation: 'modal' }} />
          <Stack.Screen name="production-form" options={{ ...pushed, presentation: 'modal' }} />
        </Stack.Protected>
        <Stack.Protected guard={status !== 'signed-in'}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LockProvider>
          <DataProvider>
            <Navigator />
          </DataProvider>
        </LockProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
