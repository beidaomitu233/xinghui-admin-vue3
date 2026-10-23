import { useTabbarStore } from '@vben/stores';

const retiredPaths = new Set([
  '/notifications',
  '/system/news',
  '/system/notification-template',
]);

/** Targeted session-tab migration; other tabs and all user preferences stay intact. */
export async function pruneRetiredTabs() {
  const store = useTabbarStore();
  const retained = store.tabs.filter((tab) => {
    const path = (tab.path || tab.fullPath || '')
      .split(/[?#]/)[0]
      ?.replace(/\/$/, '');
    return (
      tab.name !== 'PersonalNotificationInbox' && !retiredPaths.has(path ?? '')
    );
  });
  if (retained.length !== store.tabs.length) {
    store.tabs = retained;
    await store.updateCacheTabs();
  }
}
