import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorageManager } from '../../../../packages/@core/base/shared/src/cache/storage-manager';
import { defaultPreferences } from '../../../../packages/@core/preferences/src/config';
import { PreferenceManager } from '../../../../packages/@core/preferences/src/preferences';
import { updateCSSVariables } from '../../../../packages/@core/preferences/src/update-css-variables';

let workspaceRoot = process.cwd();
while (!existsSync(join(workspaceRoot, 'pnpm-workspace.yaml'))) {
  const parent = dirname(workspaceRoot);
  if (parent === workspaceRoot) throw new Error('Workspace root missing');
  workspaceRoot = parent;
}
const tokens = (path: string) =>
  readFileSync(join(workspaceRoot, path), 'utf8');
const defaultTokens = tokens(
  'packages/@core/base/design/src/design-tokens/default.css',
);
const darkTokens = tokens(
  'packages/@core/base/design/src/design-tokens/dark.css',
);
const workspaceTokens = tokens('apps/web-ele/src/styles/workspace-theme.css');

afterEach(() => {
  document.head
    .querySelectorAll('[data-ui05-test]')
    .forEach((el) => el.remove());
  document.documentElement.removeAttribute('style');
  document.documentElement.classList.remove('dark');
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const key of [
    'preferences',
    'preferences-locale',
    'preferences-theme',
    'auth',
  ]) {
    localStorage.removeItem(`ui05-theme-test-${key}`);
  }
});

describe('uI05 neutral workspace theme', () => {
  it.each(['pink', 'rose', 'default', 'custom'] as const)(
    'keeps %s accents independent of workspace surfaces across light/dark switches',
    (builtinType) => {
      const style = document.createElement('style');
      style.dataset.ui05Test = '';
      style.textContent = `${defaultTokens}\n${darkTokens}\n${workspaceTokens}`;
      document.head.append(style);
      const preference = structuredClone(defaultPreferences);
      preference.theme.builtinType = builtinType;
      preference.theme.colorPrimary = 'hsl(330 80% 50%)';
      for (const mode of ['light', 'dark', 'light'] as const) {
        preference.theme.mode = mode;
        updateCSSVariables(preference);
        const computed = getComputedStyle(document.documentElement);
        expect(computed.getPropertyValue('--background-deep').trim()).toBe(
          mode === 'dark' ? '220deg 13.06% 9%' : '216 20.11% 95.47%',
        );
        expect(computed.getPropertyValue('--card').trim()).toBe(
          mode === 'dark' ? '222.34deg 10.43% 12.27%' : '0 0% 100%',
        );
        expect(document.documentElement.dataset.theme).toBe(builtinType);
        expect(preference.theme.colorPrimary).toBe('hsl(330 80% 50%)');
      }
    },
  );
  it('loads an old custom/auto preference without clearing brand, locale, layout or auth storage', async () => {
    vi.useFakeTimers();
    const nativeMatchMedia = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      const media = nativeMatchMedia(query);
      if (query === '(prefers-color-scheme: dark)') {
        Object.defineProperty(media, 'matches', { value: true });
      }
      return media;
    });
    const style = document.createElement('style');
    style.dataset.ui05Test = '';
    style.textContent = `${defaultTokens}\n${darkTokens}\n${workspaceTokens}`;
    document.head.append(style);
    const oldPreference = structuredClone(defaultPreferences);
    oldPreference.app.locale = 'en-US';
    oldPreference.app.contentPadding = 24;
    oldPreference.sidebar.collapsed = true;
    oldPreference.theme.builtinType = 'custom';
    oldPreference.theme.colorPrimary = 'hsl(330 80% 50%)';
    oldPreference.theme.mode = 'auto';
    const storage = new StorageManager({ prefix: 'ui05-theme-test' });
    storage.setItem('preferences', oldPreference);
    storage.setItem('auth', { sentinel: 'unchanged' });
    const authBefore = localStorage.getItem('ui05-theme-test-auth');
    const manager = new PreferenceManager();
    await manager.initPreferences({ namespace: 'ui05-theme-test' });
    await vi.advanceTimersByTimeAsync(200);
    const restored = manager.getPreferences();
    expect(restored.app.locale).toBe('en-US');
    expect(restored.app.contentPadding).toBe(24);
    expect(restored.sidebar.collapsed).toBe(true);
    expect(restored.theme.colorPrimary).toBe(oldPreference.theme.colorPrimary);
    expect(restored.theme.mode).toBe('auto');
    expect(localStorage.getItem('ui05-theme-test-auth')).toBe(authBefore);
    expect(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--background-deep')
        .trim(),
    ).toBe('220deg 13.06% 9%');
  });
});
