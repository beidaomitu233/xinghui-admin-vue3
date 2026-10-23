import type { RouteRecordRaw } from 'vue-router';

import { createMemoryHistory, createRouter } from 'vue-router';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRouterGuard } from './guard';

const mocks = vi.hoisted(() => ({
  accessStore: null as any,
  userStore: {
    userInfo: { roles: ['tenant-user'], homePath: '/home' },
    setUserInfo: vi.fn(),
  },
  fetchUserInfo: vi.fn(),
  generateAccess: vi.fn(),
}));

vi.mock('@vben/stores', () => ({
  useAccessStore: () => mocks.accessStore,
  useUserStore: () => mocks.userStore,
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({ fetchUserInfo: mocks.fetchUserInfo }),
}));
vi.mock('@vben/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@vben/utils')>();
  return {
    ...actual,
    startProgress: vi.fn(),
    stopProgress: vi.fn(),
  };
});
vi.mock('./access', () => ({ generateAccess: mocks.generateAccess }));
vi.mock('./retired-tabs', () => ({ pruneRetiredTabs: vi.fn() }));

function makeRouter() {
  const routes: RouteRecordRaw[] = [
    {
      path: '/',
      name: 'Root',
      component: { template: '<router-view />' },
      children: [
        {
          path: '/profile',
          name: 'Profile',
          component: { template: '<div />' },
        },
        {
          path: '/notifications',
          name: 'PersonalNotificationInbox',
          component: { template: '<div />' },
        },
      ],
    },
    {
      path: '/auth/login',
      name: 'Login',
      component: { template: '<div />' },
    },
    {
      path: '/:path(.*)*',
      name: 'FallbackNotFound',
      component: { template: '<div />' },
    },
  ];
  const router = createRouter({ history: createMemoryHistory(), routes });
  createRouterGuard(router);
  return router;
}

describe('personal notification route access', () => {
  beforeEach(() => {
    mocks.accessStore = {
      accessToken: null,
      isAccessChecked: false,
      loginExpired: false,
      setAccessMenus: vi.fn(),
      setAccessCodes: vi.fn(),
      setAccessRoutes: vi.fn(),
    };
    mocks.accessStore.setIsAccessChecked = vi.fn((value: boolean) => {
      mocks.accessStore.isAccessChecked = value;
    });
    mocks.fetchUserInfo.mockResolvedValue({
      roles: ['tenant-user'],
      homePath: '/home',
    });
    mocks.generateAccess.mockResolvedValue({
      accessibleMenus: [],
      accessibleRoutes: [],
    });
    vi.clearAllMocks();
  });

  it('requires login and preserves the requested inbox location', async () => {
    const router = makeRouter();
    await router.push('/notifications?notificationId=41');

    expect(router.currentRoute.value.name).toBe('Login');
    expect(router.currentRoute.value.query.redirect).toBe(
      encodeURIComponent('/notifications?notificationId=41'),
    );
  });

  it('protects the personal profile despite being a core route and preserves its target', async () => {
    const router = makeRouter();
    await router.push('/profile');
    expect(router.currentRoute.value.name).toBe('Login');
    expect(router.currentRoute.value.query.redirect).toBe(
      encodeURIComponent('/profile'),
    );
  });

  it('initializes identity and access before a menu-less profile deep link', async () => {
    mocks.accessStore.accessToken = 'ordinary-token';
    mocks.fetchUserInfo.mockResolvedValue({
      roles: [],
      homePath: '/workspace',
    });
    const router = makeRouter();
    await router.push('/profile');
    expect(mocks.fetchUserInfo).toHaveBeenCalledOnce();
    expect(mocks.generateAccess).toHaveBeenCalledOnce();
    expect(mocks.accessStore.isAccessChecked).toBe(true);
    expect(router.currentRoute.value.name).toBe('Profile');
  });

  it('opens only a retry shell and clears cached identity on transient profile initialization failure', async () => {
    mocks.accessStore.accessToken = 'ordinary-token';
    mocks.fetchUserInfo.mockRejectedValueOnce(new Error('unavailable'));
    const router = makeRouter();
    await router.push('/profile');
    expect(router.currentRoute.value.meta.profileInfoFailed).toBe(true);
    expect(mocks.userStore.setUserInfo).toHaveBeenCalledWith(null);
    expect(mocks.generateAccess).not.toHaveBeenCalled();
    expect(mocks.accessStore.isAccessChecked).toBe(false);
    await router.replace({ path: '/profile', force: true });
    expect(mocks.accessStore.isAccessChecked).toBe(true);
    expect(router.currentRoute.value.name).toBe('Profile');
  });

  it('returns to login on an expired profile session', async () => {
    mocks.accessStore.accessToken = 'expired-token';
    mocks.fetchUserInfo.mockImplementationOnce(async () => {
      mocks.accessStore.accessToken = null;
      throw new Error('expired');
    });
    const router = makeRouter();
    await router.push('/profile');
    expect(router.currentRoute.value.name).toBe('Login');
  });

  it('initializes the user route permissions before opening a deep-linked inbox', async () => {
    mocks.accessStore.accessToken = 'tenant-token';
    const router = makeRouter();
    await router.push('/notifications');

    expect(mocks.fetchUserInfo).toHaveBeenCalledOnce();
    expect(mocks.generateAccess).toHaveBeenCalledOnce();
    expect(mocks.accessStore.setIsAccessChecked).toHaveBeenCalledWith(true);
    expect(router.currentRoute.value.name).toBe('PersonalNotificationInbox');
  });

  it('falls back to the first role-visible route when the configured home route is unavailable', async () => {
    mocks.accessStore.accessToken = 'tenant-token';
    mocks.fetchUserInfo.mockResolvedValue({
      roles: ['tenant-user'],
      homePath: '/workspace',
    });
    mocks.generateAccess.mockImplementation(async ({ router }) => {
      const route = {
        path: '/system/user',
        name: 'UserManagement',
        component: { template: '<div />' },
        meta: { hideInMenu: false },
      } as RouteRecordRaw;
      router.addRoute('Root', route);
      return { accessibleMenus: [], accessibleRoutes: [route] };
    });
    const router = makeRouter();

    await router.push('/workspace');

    expect(router.currentRoute.value.name).toBe('UserManagement');
    expect(router.currentRoute.value.path).toBe('/system/user');
  });

  it('opens the protected notification center when no business route or home exists', async () => {
    mocks.accessStore.accessToken = 'ordinary-token';
    mocks.fetchUserInfo.mockResolvedValue({
      roles: [],
      homePath: '/workspace',
    });
    mocks.generateAccess.mockResolvedValue({
      accessibleMenus: [],
      accessibleRoutes: [],
    });
    const router = makeRouter();
    await router.push('/workspace');
    expect(router.currentRoute.value.name).toBe('PersonalNotificationInbox');
    expect(mocks.accessStore.setAccessMenus).toHaveBeenCalledWith([]);
  });

  it('keeps the no-access landing for a role with no visible menus', async () => {
    mocks.accessStore.accessToken = 'tenant-token';
    mocks.fetchUserInfo.mockResolvedValue({
      roles: ['tenant-user'],
      homePath: '/workspace',
    });
    mocks.generateAccess.mockImplementation(async ({ router }) => {
      const route = {
        path: '/workspace',
        name: 'NoAccessiblePages',
        component: { template: '<div />' },
        meta: { hideInMenu: true },
      } as RouteRecordRaw;
      router.addRoute('Root', route);
      return { accessibleMenus: [], accessibleRoutes: [route] };
    });
    const router = makeRouter();

    await router.push('/workspace');

    expect(router.currentRoute.value.name).toBe('NoAccessiblePages');
    expect(router.currentRoute.value.path).toBe('/workspace');
  });
});
