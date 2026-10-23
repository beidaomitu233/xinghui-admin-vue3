import { addCollection, iconLoaded } from '@vben/icons';

import collections from 'virtual:xinghui-local-icons';
import { describe, expect, it } from 'vitest';

import { localAvatar, localDefaultAsset, localLogo } from './local-assets';
import { navigationIcon, navigationIcons } from './navigation-icons';

collections.forEach((collection) => addCollection(collection));
describe('local navigation assets', () => {
  it('bundles every server menu icon and supplies local unknown/image fallbacks', () => {
    expect(collections.length).toBeGreaterThan(0);
    expect(
      collections.find((collection) => collection.prefix === 'carbon')?.icons
        .home?.body,
    ).toMatch(/<path\b/);
    expect(navigationIcons.filter((icon) => !iconLoaded(icon))).toEqual([]);
    expect(navigationIcon('carbon:home')).toBe('carbon:home');
    for (const icon of [
      '',
      '#',
      'unknown:not-an-icon',
      'https://invalid.example/menu.png',
    ]) {
      expect(navigationIcon(icon)).toBe('carbon:application');
      expect(navigationIcon(icon, true)).toBe('carbon:folder');
    }
  });
  it('replaces only legacy defaults and retains intentional user customizations', () => {
    expect(
      localDefaultAsset(
        'https://unpkg.com/@vbenjs/static-source@0.1.7/source/avatar-v1.webp',
        'avatar',
      ),
    ).toBe(localAvatar);
    expect(
      localDefaultAsset(
        'https://unpkg.com/@vbenjs/static-source@0.1.7/source/logo-v1.webp',
        'logo',
      ),
    ).toBe(localLogo);
    expect(localDefaultAsset('/uploads/my-logo.png', 'logo')).toBe(
      '/uploads/my-logo.png',
    );
  });
});
