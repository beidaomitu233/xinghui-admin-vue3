import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from './auth';

const state = vi.hoisted(() => ({
  access: {
    accessToken: 'session-A' as null | string,
    setLoginExpired: vi.fn(),
    setAccessCodes: vi.fn(),
  },
  users: { setUserInfo: vi.fn() },
  replace: vi.fn(),
  info: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => state.access,
  useUserStore: () => state.users,
  resetAllStores: () => {
    state.access.accessToken = null;
    state.users.setUserInfo(null);
  },
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({
    replace: state.replace,
    currentRoute: { value: { fullPath: '/profile' } },
  }),
}));
vi.mock('#/api', () => ({
  getUserInfoApi: state.info,
  logoutApi: state.logout,
  loginApi: vi.fn(),
}));
vi.mock('element-plus', () => ({ ElNotification: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  setActivePinia(createPinia());
  state.access.accessToken = 'session-A';
});
describe('current identity response fencing', () => {
  it('cannot restore an old identity after logout while its request is pending', async () => {
    let resolve!: (value: any) => void;
    state.info.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const auth = useAuthStore();
    const pending = auth.fetchUserInfo();
    const rejected = expect(pending).rejects.toThrow('会话已变更');
    await auth.logout(false);
    resolve({ username: 'old-user', permissions: ['system:user:edit'] });
    await rejected;
    expect(state.users.setUserInfo).toHaveBeenCalledWith(null);
    expect(state.users.setUserInfo).not.toHaveBeenCalledWith(
      expect.objectContaining({ username: 'old-user' }),
    );
    expect(state.access.setAccessCodes).not.toHaveBeenCalled();
  });
  it('rejects a response from the previous login and writes only current identity', async () => {
    let resolve!: (value: any) => void;
    state.info.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const auth = useAuthStore();
    const pending = auth.fetchUserInfo();
    const rejected = expect(pending).rejects.toThrow('会话已变更');
    state.access.accessToken = 'session-B';
    resolve({ username: 'old-user', permissions: [] });
    await rejected;
    const current = { username: 'current-user', permissions: [] };
    state.info.mockResolvedValueOnce(current);
    await auth.fetchUserInfo();
    expect(state.users.setUserInfo).toHaveBeenCalledWith(current);
  });
});
