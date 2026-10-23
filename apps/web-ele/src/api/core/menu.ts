import type { RouteRecordStringComponent } from '@vben/types';

import { requestClient } from '#/api/request';
import { navigationIcon } from '#/navigation-icons';

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

/** Rearrange only pages already returned by the permission-filtered API. */
export function normalizeNavigationMenus(menus: BackendMenu[]): BackendMenu[] {
  const homes: BackendMenu[] = [];
  const walk = (nodes: BackendMenu[]): BackendMenu[] =>
    nodes.flatMap((menu) => {
      const copy = {
        ...menu,
        ...(menu.children ? { children: walk(menu.children) } : {}),
      };
      if (
        menu.menuType === 'C' &&
        ['dashboard/analytics/index', 'dashboard/workspace/index'].includes(
          menu.component ?? '',
        )
      ) {
        const workspace = menu.component === 'dashboard/workspace/index';
        homes.push({
          ...copy,
          path: workspace ? '/workspace' : '/analytics',
          orderNum: workspace ? -20 : -10,
        });
        return [];
      }
      // This also covers an already migrated server tree whose role still has
      // the former parent grant. An empty directory must not become a page.
      if (
        menu.menuType === 'M' &&
        !copy.children?.some((child) => child.menuType !== 'F')
      )
        return [];
      return [copy];
    });
  const remaining = walk(menus);
  return [...homes, ...remaining].toSorted(
    (a, b) =>
      (a.orderNum ?? a.meta?.order ?? 0) - (b.orderNum ?? b.meta?.order ?? 0),
  );
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
          icon: navigationIcon(menu.icon || menu.meta?.icon, directory),
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
  return transformMenusToRoutes(normalizeNavigationMenus(menus));
}
