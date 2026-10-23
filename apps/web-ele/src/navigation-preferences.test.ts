import { beforeEach, describe, expect, it } from 'vitest';

import { migrateNavigationPreferences } from './navigation-preferences';

describe('navigation preference upgrade', () => {
  beforeEach(() => localStorage.clear());
  it('upgrades an existing accordion cache without deleting unrelated preferences or auth', () => {
    const old = {
      value: {
        navigation: { accordion: true, styleType: 'rounded' },
        theme: { mode: 'dark' },
        sidebar: { collapsed: true },
      },
      expiry: 9_999_999_999_999,
    };
    localStorage.setItem('app-preferences', JSON.stringify(old));
    localStorage.setItem('app-core-access', 'session-sentinel');
    expect(migrateNavigationPreferences('app')).toBe(true);
    expect(JSON.parse(localStorage.getItem('app-preferences') ?? '{}')).toEqual(
      {
        ...old,
        value: {
          ...old.value,
          navigation: { ...old.value.navigation, accordion: false },
        },
      },
    );
    expect(localStorage.getItem('app-core-access')).toBe('session-sentinel');
    expect(migrateNavigationPreferences('app')).toBe(false);
  });
  it('tolerates malformed and denied storage and keeps namespaces separate', () => {
    localStorage.setItem('broken-preferences', '{');
    expect(() => migrateNavigationPreferences('broken')).not.toThrow();
    expect(localStorage.getItem('other-navigation-v1')).toBeNull();
    const denied = {
      getItem() {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(migrateNavigationPreferences('blocked', denied)).toBe(true);
  });
});
