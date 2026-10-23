import { ref } from 'vue';

import { useAccessStore } from '@vben/stores';

import { defineStore } from 'pinia';

import { getMyUnreadCount } from '#/api/system/personal-notification';

function parseUnreadCount(value: unknown): null | number {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;

  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
}

export const usePersonalNotificationStore = defineStore(
  'personal-notification',
  () => {
    const accessStore = useAccessStore();
    const unreadCount = ref<null | number>(null);
    let requestVersion = 0;

    function clearUnreadCount() {
      requestVersion += 1;
      unreadCount.value = null;
    }

    async function refreshUnreadCount() {
      const token = accessStore.accessToken;
      if (!token) {
        clearUnreadCount();
        return;
      }

      const version = ++requestVersion;
      try {
        const count = await getMyUnreadCount();
        if (version === requestVersion && accessStore.accessToken === token) {
          unreadCount.value = parseUnreadCount(count);
        }
      } catch {
        if (version === requestVersion && accessStore.accessToken === token) {
          unreadCount.value = null;
        }
      }
    }

    return {
      $reset: clearUnreadCount,
      clearUnreadCount,
      refreshUnreadCount,
      unreadCount,
    };
  },
);
