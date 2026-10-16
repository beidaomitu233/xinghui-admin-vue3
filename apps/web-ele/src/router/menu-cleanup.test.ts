import type { RouteRecordStringComponent } from '@vben/types';

import { createMemoryHistory, createRouter, RouterView } from 'vue-router';

import { describe, expect, it } from 'vitest';

import { generateAccessibleLocal } from './routes-helper';

describe('uI05 consolidated menus', () => {
  it('preserves absolute child links and adds the existing protected inbox without granting a page', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          name: 'Root',
          path: '/',
          component: RouterView,
          children: [
            {
              name: 'PersonalNotificationInbox',
              path: '/notifications',
              component: {},
            },
          ],
        },
        { name: 'FallbackNotFound', path: '/:path(.*)*', component: {} },
      ],
    });
    const menus: RouteRecordStringComponent[] = [
      {
        name: 'Capabilities',
        path: '/infra',
        component: 'BasicLayout',
        meta: { title: '通用能力' },
        children: [
          {
            name: 'Notice',
            path: '/infra/notice',
            component: 'system/notice/index',
            meta: { title: '通知公告', order: 5 },
          },
          {
            name: 'Template',
            path: '/system/notification-template',
            component: 'system/notification-template/index',
            meta: { title: '通知模板', order: 6 },
          },
          {
            name: 'News',
            path: '/system/news',
            component: 'system/news/index',
            meta: { title: '资讯管理', order: 8 },
          },
        ],
      },
    ];
    const result = await generateAccessibleLocal({
      router,
      routes: [],
      fetchMenuListAsync: async () => menus,
      layoutMap: { BasicLayout: async () => ({}) },
    });
    expect(result.accessibleMenus[0]?.children?.map((m) => m.path)).toEqual([
      '/infra/notice',
      '/system/notification-template',
      '/notifications',
      '/system/news',
    ]);
    expect(result.accessibleMenus[0]?.children?.[2]?.parent).toBe('/infra');
    expect(router.resolve('/notifications').name).toBe(
      'PersonalNotificationInbox',
    );
    expect(router.resolve('/system/download').name).toBe('FallbackNotFound');
    expect(router.resolve('/system/page').name).toBe('FallbackNotFound');
    expect(router.resolve('/site/banner').name).toBe('FallbackNotFound');
    expect(router.resolve('/infra/material-example').name).toBe(
      'FallbackNotFound',
    );
  });
  it('keeps a personal-only capabilities directory for an account with no business menus', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          name: 'PersonalNotificationInbox',
          path: '/notifications',
          component: {},
        },
      ],
    });
    const result = await generateAccessibleLocal({
      router,
      routes: [],
      fetchMenuListAsync: async () => [],
      layoutMap: {},
    });
    expect(result.accessibleMenus.map((menu) => menu.path)).toEqual(['/infra']);
    expect(
      result.accessibleMenus[0]?.children?.map((menu) => menu.path),
    ).toEqual(['/notifications']);
    expect(router.resolve('/notifications').name).toBe(
      'PersonalNotificationInbox',
    );
  });
  it('preserves the ordinary seed role menu and adds only the protected personal inbox', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          name: 'Root',
          path: '/',
          component: RouterView,
          children: [
            {
              name: 'PersonalNotificationInbox',
              path: '/notifications',
              component: {},
            },
          ],
        },
        { name: 'FallbackNotFound', path: '/:path(.*)*', component: {} },
      ],
    });
    // Native QA query for seed role_key=user: only directory 1 and C page 100.
    const menus: RouteRecordStringComponent[] = [
      {
        name: 'System',
        path: '/system',
        component: 'BasicLayout',
        meta: { title: '系统管理', order: 1 },
        children: [
          {
            name: 'User',
            path: '/system/user',
            component: 'system/user/index',
            meta: { title: '用户管理' },
          },
        ],
      },
    ];
    const result = await generateAccessibleLocal({
      router,
      routes: [],
      fetchMenuListAsync: async () => menus,
      layoutMap: { BasicLayout: async () => ({}) },
    });
    expect(result.accessibleMenus.map((menu) => menu.path)).toEqual([
      '/system',
      '/infra',
    ]);
    expect(
      result.accessibleMenus[0]?.children?.map((menu) => menu.path),
    ).toEqual(['/system/user']);
    expect(
      result.accessibleMenus[1]?.children?.map((menu) => menu.path),
    ).toEqual(['/notifications']);
    expect(result.accessibleRoutes.map((route) => route.path)).toEqual([
      '/system',
    ]);
    expect(router.resolve('/notifications').name).toBe(
      'PersonalNotificationInbox',
    );
    expect(router.resolve('/system/business-config').name).toBe(
      'FallbackNotFound',
    );
    expect(router.resolve('/ai/model').name).toBe('FallbackNotFound');
  });
  it('does not create a personal directory when the protected inbox route is absent', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [] });
    const result = await generateAccessibleLocal({
      router,
      routes: [],
      fetchMenuListAsync: async () => [],
      layoutMap: {},
    });
    expect(result.accessibleMenus).toEqual([]);
  });
});
