import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialTheme, PALETTES, THEMES, type Palette } from '../src/theme.ts';

const css = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const BLOCKS: Record<string, string> = { light: ':root{', dark: '[data-theme="dark"]{', ocean: '[data-theme="ocean"]{' };
const VARS: Record<keyof Palette, string> = {
  ink: 'ink', paper: 'paper', surface: 'surface', brass: 'brass', pew: 'pew', rust: 'rust', line: 'line', muted: 'muted',
  fieldLabel: 'field-label', bannerBg: 'banner-bg', brassSoft: 'brass-soft', c0: 'c0', c1: 'c1', c2: 'c2', c3: 'c3', c4: 'c4',
};

test('app palettes match the website theme variables', () => {
  for (const theme of THEMES) {
    const start = css.indexOf(BLOCKS[theme]);
    const block = css.slice(start, css.indexOf('}', start));
    for (const [key, name] of Object.entries(VARS)) {
      const value = new RegExp(`--${name}:([^;]+);`).exec(block)?.[1].trim();
      assert.equal(PALETTES[theme][key as keyof Palette], value, `${theme} ${name}`);
    }
  }
});
test('a saved theme wins, otherwise the phone setting decides', () => {
  assert.equal(initialTheme('ocean', 'light'), 'ocean');
  assert.equal(initialTheme(null, 'dark'), 'dark');
  assert.equal(initialTheme('neon', 'light'), 'light');
  assert.equal(initialTheme(null, null), 'light');
});
