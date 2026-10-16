import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePersonalNotificationStore } from './personal-notification';

const mocks = vi.hoisted(() => ({
  accessStore: { accessToken: 'user-a-token' as null | string },
  getMyUnreadCount: vi.fn(),
}));

vi.mock('@vben/stores', () => ({
  useAccessStore: () => mocks.accessStore,
}));
vi.mock('#/api/system/personal-notification', () => ({
  getMyUnreadCount: mocks.getMyUnreadCount,
}));

describe('personal notification unread count', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.accessStore.accessToken = 'user-a-token';
    vi.resetAllMocks();
  });

  it('loads the owner count and clears it when the API fails', async () => {
    const store = usePersonalNotificationStore();
    mocks.getMyUnreadCount
      .mockResolvedValueOnce(4)
      .mockRejectedValueOnce(new Error('offline'));

    await store.refreshUnreadCount();
    expect(store.unreadCount).toBe(4);

    await store.refreshUnreadCount();
    expect(store.unreadCount).toBeNull();
  });

  it('accepts safe integer counts returned as strings', async () => {
    const store = usePersonalNotificationStore();
    mocks.getMyUnreadCount
      .mockResolvedValueOnce('2')
      .mockResolvedValueOnce('9007199254740992');

    await store.refreshUnreadCount();
    expect(store.unreadCount).toBe(2);

    await store.refreshUnreadCount();
    expect(store.unreadCount).toBeNull();
  });

  it('ignores an in-flight response after the session is cleared', async () => {
    const store = usePersonalNotificationStore();
    let resolveCount!: (value: number) => void;
    mocks.getMyUnreadCount.mockReturnValueOnce(
      new Promise<number>((resolve) => {
        resolveCount = resolve;
      }),
    );

    const pending = store.refreshUnreadCount();
    mocks.accessStore.accessToken = null;
    store.clearUnreadCount();
    resolveCount(9);
    await pending;

    expect(store.unreadCount).toBeNull();
  });
});
