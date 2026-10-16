import { createMemoryHistory, createRouter } from 'vue-router';

import { preferences } from '@vben/preferences';

import { describe, expect, it } from 'vitest';

import { generateAccessibleLocal } from './routes-helper';

describe('empty menu access', () => {
  it('keeps a layout page and logout path without exposing management routes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'Root', component: { template: '<router-view />' } },
        { path: '/:path(.*)*', name: 'FallbackNotFound', component: {} },
      ],
    });

    const { accessibleMenus, accessibleRoutes } = await generateAccessibleLocal(
      {
        fetchMenuListAsync: async () => [],
        router,
        routes: [],
      },
    );

    expect(accessibleMenus).toEqual([]);
    expect(accessibleRoutes).toHaveLength(1);
    const landing = router.resolve(preferences.app.defaultHomePath);
    expect(landing.name).toBe('NoAccessiblePages');
    expect(landing.matched[0]?.name).toBe('Root');
    expect(router.resolve('/system/user').name).toBe('FallbackNotFound');
    expect(router.resolve('/system/role').name).toBe('FallbackNotFound');
  });
});

describe('server-filtered platform menus', () => {
  it('registers only pages returned by the server', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'Root', component: { template: '<router-view />' } },
        { path: '/:path(.*)*', name: 'FallbackNotFound', component: {} },
      ],
    });
    const { accessibleRoutes } = await generateAccessibleLocal({
      fetchMenuListAsync: async () => [
        {
          name: 'UserPage',
          path: '/system/user',
          component: 'BasicLayout',
          meta: { title: '用户管理' },
        },
      ],
      layoutMap: { BasicLayout: async () => ({ template: '<div />' }) },
      router,
      routes: [],
    });

    expect(accessibleRoutes).toHaveLength(1);
    expect(router.resolve('/system/user').name).toBe('UserPage');
    expect(router.resolve('/system/config').name).toBe('FallbackNotFound');
    expect(router.resolve('/monitor/job').name).toBe('FallbackNotFound');
    expect(router.resolve('/monitor/operlog').name).toBe('FallbackNotFound');
  });
});
