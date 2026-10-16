import type { RouteRecordStringComponent } from '@vben/types';

import { requestClient } from '#/api/request';

interface BackendMenu {
  children?: BackendMenu[];
  component?: string;
  icon?: string;
  id?: number | string;
  menuId?: number | string;
  menuName?: string;
  menuType?: string;
  meta?: RouteRecordStringComponent['meta'];
  orderNum?: number;
  path?: string;
  visible?: number | string;
}

function resolveMenuPath(path: string, parentPath = '') {
  return (
    (path.startsWith('/') ? path : `${parentPath}/${path}`)
      .replaceAll(/\/{2,}/g, '/')
      .replace(/\/$/, '') || '/'
  );
}

/** IDs retain route identity when labels change; buttons never become pages. */
export function transformMenusToRoutes(
  menus: BackendMenu[],
  parentPath = '',
): RouteRecordStringComponent[] {
  return menus
    .filter((menu) => menu.menuType !== 'F')
    .map((menu) => {
      const path = resolveMenuPath(menu.path || '', parentPath);
      const children = transformMenusToRoutes(menu.children || [], path);
      const directory = menu.menuType === 'M';
      return {
        name: `BackendMenu_${menu.menuId ?? menu.id ?? encodeURIComponent(path)}`,
        path,
        component:
          directory && children.length > 0
            ? 'BasicLayout'
            : menu.component || '__missing_page__',
        ...(children.length > 0 ? { children } : {}),
        ...(directory && children.length > 0
          ? { redirect: children[0]?.path }
          : {}),
        meta: {
          ...menu.meta,
          title: menu.menuName || menu.meta?.title || '',
          icon: menu.icon || menu.meta?.icon || '',
          order: menu.orderNum ?? menu.meta?.order,
          hideInMenu:
            String(menu.visible) === '1' || menu.meta?.hideInMenu === true,
        },
      };
    });
}

export async function getAllMenusApi() {
  const res = await requestClient.get<
    BackendMenu[] | { data?: BackendMenu[]; routers?: BackendMenu[] }
  >('/user/router');
  const menus = Array.isArray(res) ? res : (res?.routers ?? res?.data ?? []);
  return transformMenusToRoutes(menus);
}
