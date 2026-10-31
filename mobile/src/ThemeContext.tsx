import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initialTheme, PALETTES, THEME_STORAGE_KEY, type Palette, type ThemeName } from './theme.ts';

type ThemeState = { theme: ThemeName; colors: Palette; ready: boolean; setTheme: (theme: ThemeName) => void };
const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [theme, setThemeState] = useState<ThemeName>(initialTheme(null, system));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then(stored => setThemeState(initialTheme(stored, system)))
      .catch(() => {})
      .finally(() => setReady(true));
    // Only read the saved choice once; later system changes don't override it.
  }, []);

  const value = useMemo<ThemeState>(() => ({
    theme, colors: PALETTES[theme], ready,
    setTheme(next) { setThemeState(next); AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {}); },
  }), [theme, ready]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}
