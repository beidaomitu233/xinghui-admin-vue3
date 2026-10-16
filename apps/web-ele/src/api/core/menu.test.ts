import { describe, expect, it, vi } from 'vitest';

import { transformMenusToRoutes } from './menu';

vi.mock('#/api/request', () => ({ requestClient: { get: vi.fn() } }));

describe('backend menu conversion', () => {
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
