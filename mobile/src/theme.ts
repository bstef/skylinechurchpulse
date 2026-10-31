// Mirrors the CSS custom properties in ../index.html so the app and website match.
// tests/theme.test.ts fails if the two drift apart.
export type ThemeName = 'light' | 'dark' | 'ocean';
export const THEMES: ThemeName[] = ['light', 'dark', 'ocean'];
export const THEME_LABELS: Record<ThemeName, string> = { light: 'Light', dark: 'Dark', ocean: 'Ocean' };
// Same key the website uses in localStorage.
export const THEME_STORAGE_KEY = 'skyline-theme';

export type Palette = {
  ink: string; paper: string; surface: string; brass: string; pew: string; rust: string;
  line: string; muted: string; fieldLabel: string; bannerBg: string; brassSoft: string;
  c0: string; c1: string; c2: string; c3: string; c4: string;
};

export const PALETTES: Record<ThemeName, Palette> = {
  light: {
    ink: '#1F2A24', paper: '#F6F3EC', surface: '#FFFFFF', brass: '#B8925A', pew: '#2876FF', rust: '#A6503C',
    line: '#D8D1C0', muted: '#8A8375', fieldLabel: '#5B5546', bannerBg: '#F3E4DE', brassSoft: 'rgba(184,146,90,.14)',
    c0: '#B8925A', c1: '#2876FF', c2: '#A6503C', c3: '#2E9C8F', c4: '#7A5C9E',
  },
  dark: {
    ink: '#EDE8DA', paper: '#1C1E21', surface: '#26282B', brass: '#D3AD78', pew: '#5B93FF', rust: '#DD8266',
    line: '#35373A', muted: '#96989C', fieldLabel: '#C7C5C0', bannerBg: '#3A241E', brassSoft: 'rgba(211,173,120,.16)',
    c0: '#D3AD78', c1: '#5B93FF', c2: '#DD8266', c3: '#4FB5A8', c4: '#A98BC9',
  },
  ocean: {
    ink: '#DCEEF0', paper: '#0E2229', surface: '#142E37', brass: '#E3BC7C', pew: '#52BF93', rust: '#E28F6E',
    line: '#24444E', muted: '#86AEB6', fieldLabel: '#BFDBDD', bannerBg: '#3A2620', brassSoft: 'rgba(227,188,124,.18)',
    c0: '#E3BC7C', c1: '#52BF93', c2: '#E28F6E', c3: '#6EC5E8', c4: '#A79AE0',
  },
};

// Like the website: a saved choice wins, otherwise follow the phone's light/dark setting.
export function initialTheme(stored: string | null, systemScheme: string | null | undefined): ThemeName {
  if (stored && (THEMES as string[]).includes(stored)) return stored as ThemeName;
  return systemScheme === 'dark' ? 'dark' : 'light';
}
export function isDarkTheme(theme: ThemeName): boolean {
  return theme !== 'light';
}
