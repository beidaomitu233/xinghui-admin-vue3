import { describe, expect, it, vi } from 'vitest';

import { normalizeNavigationMenus, transformMenusToRoutes } from './menu';

vi.mock('#/api/request', () => ({ requestClient: { get: vi.fn() } }));

describe('backend menu conversion', () => {
  it('consolidates the Agent product settings without adding menu grants', () => {
    const menus = normalizeNavigationMenus([
      {
        menuId: 'ai',
        menuType: 'M',
        children: [
          {
            menuId: 'prompt',
            menuType: 'C',
            component: 'system/ai-template/index',
          },
          {
            menuId: 'models',
            menuType: 'C',
            component: 'system/ai-config/index',
          },
        ],
      },
      {
        menuId: 'business',
        menuType: 'C',
        menuName: '系统业务配置',
        component: 'system/business-config/index',
      },
    ]);
    expect(
      menus
        .find((menu) => menu.menuName === '系统')
        ?.children?.map((item) => item.menuId),
    ).toEqual(['models']);
    expect(
      menus.find((menu) => menu.menuName === '业务')?.children?.[0]?.menuName,
    ).toBe('业务配置');
    expect(normalizeNavigationMenus([])).toEqual([]);
    const promptOnly = normalizeNavigationMenus([
      {
        menuId: 'prompt-only',
        menuType: 'C',
        component: 'system/ai-template/index',
      },
    ]);
    expect(promptOnly[0]?.children).toMatchObject([
      {
        menuId: 'prompt-only',
        component: 'system/ai-config/index',
        path: '/ai/configurations',
      },
    ]);
  });
  it('places the AI hub first only when the permission-filtered server returned it', () => {
    const menus = normalizeNavigationMenus([
      {
        menuId: 'home',
        menuType: 'C',
        component: 'dashboard/workspace/index',
        path: '/workspace',
      },
      {
        menuId: 'ai',
        menuType: 'M',
        path: '/ai',
        children: [
          {
            menuId: 'hub',
            menuType: 'C',
            component: 'ai/workbench/index',
            path: 'workbench',
          },
          {
            menuId: 'models',
            menuType: 'C',
            component: 'system/ai-config/index',
            path: 'configurations',
          },
        ],
      },
    ]);
    expect(menus.map((menu) => menu.menuId)).toEqual([
      'hub',
      'home',
      'hub-group-system',
    ]);
    expect(menus[0]).toMatchObject({
      menuName: 'AI 中台',
      path: '/ai/workbench',
      orderNum: -30,
    });
    expect(menus[2]?.children?.map((menu) => menu.menuId)).toEqual(['models']);
    expect(transformMenusToRoutes(menus)[0]?.meta?.keepAlive).toBe(true);
    expect(
      normalizeNavigationMenus([
        {
          menuId: 'home',
          menuType: 'C',
          component: 'dashboard/workspace/index',
        },
      ]).map((menu) => menu.menuId),
    ).toEqual(['home']);
  });
  it('promotes only authorized existing home pages before directories without mutating grants', () => {
    const authorized = [
      {
        menuId: 'ops',
        menuType: 'M',
        path: '/ops',
        orderNum: 3,
        children: [
          {
            menuId: 'home',
            menuType: 'C',
            component: 'dashboard/workspace/index',
            path: '/workspace',
            visible: '0',
          },
          {
            menuId: 'board',
            menuType: 'C',
            component: 'dashboard/analytics/index',
            path: '/analytics',
            visible: '1',
          },
        ],
      },
    ];
    const result = normalizeNavigationMenus(authorized);
    expect(result.map((menu) => menu.menuId)).toEqual(['home', 'board']);
    expect(result[1]?.visible).toBe('1');
    expect(
      transformMenusToRoutes(result).some(
        (route) => route.component === '__missing_page__',
      ),
    ).toBe(false);
    expect(authorized[0]?.children).toHaveLength(2);
    expect(
      normalizeNavigationMenus([
        {
          menuId: 'system',
          menuType: 'M',
          path: '/system',
          children: [
            {
              menuId: 'user',
              menuType: 'C',
              path: 'user',
              component: 'system/user/index',
            },
          ],
        },
      ]).map((menu) => menu.menuId),
    ).toEqual(['hub-group-business']);
    expect(normalizeNavigationMenus([])).toEqual([]);
  });
  it('also drops empty directories in an already migrated server response', () => {
    const result = normalizeNavigationMenus([
      {
        menuId: 'home',
        menuType: 'C',
        component: 'dashboard/workspace/index',
        path: '/workspace',
      },
      { menuId: 'ops', menuType: 'M', path: '/ops', children: [] },
      {
        menuId: 'buttons-only',
        menuType: 'M',
        path: '/actions',
        children: [{ menuId: 'action', menuType: 'F' }],
      },
    ]);
    expect(result.map((menu) => menu.menuId)).toEqual(['home']);
  });
  it('retains the operations directory when the role has another real page', () => {
    const result = normalizeNavigationMenus([
      {
        menuId: 'ops',
        menuType: 'M',
        path: '/ops',
        children: [
          {
            menuId: 'home',
            menuType: 'C',
            component: 'dashboard/workspace/index',
            path: '/workspace',
          },
          {
            menuId: 'jobs',
            menuType: 'C',
            component: 'system/job/index',
            path: 'jobs',
          },
        ],
      },
    ]);
    expect(result.map((menu) => menu.menuId)).toEqual([
      'home',
      'hub-group-operations',
    ]);
    expect(result[1]?.children?.map((menu) => menu.menuId)).toEqual(['jobs']);
    expect(transformMenusToRoutes(result)[1]?.component).toBe('BasicLayout');
  });
  it('groups existing authorized pages into three categories and preserves absolute paths and hidden ancestry', () => {
    const result = normalizeNavigationMenus([
      {
        menuId: 'old-system',
        menuType: 'M',
        path: '/system',
        children: [
          {
            menuId: 'user',
            menuType: 'C',
            path: 'user',
            component: 'system/user/index',
          },
          {
            menuId: 'role',
            menuType: 'C',
            path: 'role',
            component: 'system/role/index',
          },
          {
            menuId: 'menu',
            menuType: 'C',
            path: 'menu',
            component: 'system/menu/index',
          },
          {
            menuId: 'dict',
            menuType: 'C',
            path: 'dict',
            component: 'system/dict/index',
          },
          {
            menuId: 'config',
            menuType: 'C',
            path: 'config',
            component: 'system/config/index',
          },
        ],
      },
      {
        menuId: 'old-ai',
        menuType: 'M',
        path: '/ai',
        children: [
          {
            menuId: 'model',
            menuType: 'C',
            path: 'configurations',
            component: 'system/ai-config/index',
          },
          {
            menuId: 'calls',
            menuType: 'C',
            path: 'requests',
            component: 'system/ai-request/index',
          },
        ],
      },
      {
        menuId: 'hidden',
        menuType: 'M',
        path: '/private',
        visible: 1,
        children: [
          {
            menuId: 'private',
            menuType: 'C',
            path: 'page',
            component: 'custom/index',
          },
        ],
      },
    ]);
    expect(result.map((item) => item.menuName)).toEqual([
      '业务',
      '系统',
      '运维',
    ]);
    expect(result[0]?.children?.map((item) => item.menuId)).toEqual([
      'user',
      'role',
      'private',
    ]);
    expect(result[1]?.children?.map((item) => item.menuId)).toEqual([
      'menu',
      'dict',
      'config',
      'model',
    ]);
    expect(result[2]?.children?.map((item) => item.menuId)).toEqual(['calls']);
    expect(result[0]?.children?.[0]?.path).toBe('/system/user');
    expect(result[0]?.children?.[2]?.meta?.hideInMenu).toBe(true);
  });
  it('keeps IDs stable and unique across identical labels and excludes buttons', () => {
    const menus = [
      {
        menuId: '4',
        menuType: 'M',
        menuName: 'AI助手',
        path: 'ai',
        children: [
          {
            menuId: '106',
            menuType: 'C',
            menuName: '相同',
            path: 'model',
            component: 'system/ai-model/index',
          },
          {
            menuId: '107',
            menuType: 'C',
            menuName: '相同',
            path: '/ai/prompts',
          },
          { menuId: '108', menuType: 'F', path: 'edit' },
        ],
      },
    ];
    const [route] = transformMenusToRoutes(menus);
    expect(route?.children?.map((r) => [r.name, r.path])).toEqual([
      ['BackendMenu_106', '/ai/model'],
      ['BackendMenu_107', '/ai/prompts'],
    ]);
    expect(route?.redirect).toBe('/ai/model');
    expect(
      transformMenusToRoutes([{ ...menus[0], menuName: '改名' }])[0]?.name,
    ).toBe(route?.name);
  });
  it('preserves server visibility, zero order and empty menus', () => {
    expect(transformMenusToRoutes([])).toEqual([]);
    expect(
      transformMenusToRoutes([
        { menuId: '9', path: 'news', menuType: 'C', visible: 1, orderNum: 0 },
      ])[0]?.meta,
    ).toMatchObject({ hideInMenu: true, order: 0 });
    expect(transformMenusToRoutes([{ menuType: 'F' }])).toEqual([]);
  });
});
