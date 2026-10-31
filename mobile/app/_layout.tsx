import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { ThemeProvider, useTheme } from '../src/ThemeContext.tsx';
import { AuthProvider, useAuth } from '../src/AuthContext.tsx';
import { isDarkTheme } from '../src/theme.ts';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigator() {
  const { theme, colors, ready } = useTheme();
  const { status } = useAuth();
  const loading = !ready || status === 'loading';

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.paper).catch(() => {});
  }, [colors.paper]);
  useEffect(() => {
    if (!loading) SplashScreen.hideAsync().catch(() => {});
  }, [loading]);
  if (loading) return null;

  return (
    <>
      <StatusBar style={isDarkTheme(theme) ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Protected guard={status === 'signed-in'}>
          <Stack.Screen name="(tabs)" />
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
        <Navigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
