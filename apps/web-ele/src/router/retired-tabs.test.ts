import { useTabbarStore } from '@vben/stores';

import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import { pruneRetiredTabs } from './retired-tabs';

describe('retired management session tabs', () => {
  it('migrates old cached tabs including pinned legacy entries without clearing unrelated state', async () => {
    setActivePinia(createPinia());
    const store = useTabbarStore();
    const old = [
      '/system/news',
      '/system/notification-template',
      '/notifications?notificationId=41',
      '/system/user?filter=active',
    ];
    const cached = old.map((fullPath, index) => ({
      fullPath,
      path: fullPath.split('?')[0] ?? fullPath,
      key: fullPath,
      name: `Cached${index}`,
      meta: { keepAlive: true, affixTab: true, title: `Custom ${index}` },
    }));
    // Pinia's persisted tab plugin restores this JSON into the tabs state on startup.
    const persisted = JSON.stringify(cached);
    store.$patch({ tabs: JSON.parse(persisted) });
    store.dragEndIndex = 7;
    await pruneRetiredTabs();
    expect(store.tabs).toEqual([cached[3]]);
    expect(store.cachedTabs).toEqual(new Set(['Cached3']));
    expect(store.dragEndIndex).toBe(7);
    await pruneRetiredTabs();
    expect(store.tabs).toEqual([cached[3]]);
  });
});
