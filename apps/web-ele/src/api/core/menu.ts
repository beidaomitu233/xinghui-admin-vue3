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
  const containsModelMenu = (nodes: BackendMenu[]): boolean =>
    nodes.some(
      (menu) =>
        menu.component === 'system/ai-config/index' ||
        containsModelMenu(menu.children || []),
    );
  const hasModelMenu = containsModelMenu(menus);
  const groups: Record<string, BackendMenu> = {
    business: {
      menuId: 'hub-group-business',
      menuName: '业务',
      menuType: 'M',
      path: '/business',
      icon: 'lucide:users',
      orderNum: 10,
      children: [],
    },
    system: {
      menuId: 'hub-group-system',
      menuName: '系统',
      menuType: 'M',
      path: '/settings',
      icon: 'lucide:settings',
      orderNum: 20,
      children: [],
    },
    operations: {
      menuId: 'hub-group-operations',
      menuName: '运维',
      menuType: 'M',
      path: '/operations',
      icon: 'lucide:activity',
      orderNum: 30,
      children: [],
    },
  };
  const walk = (nodes: BackendMenu[], parentPath = '', hidden = false) => {
    for (const menu of nodes) {
      if (menu.menuType === 'F') continue;
      const path = resolveMenuPath(menu.path || '', parentPath);
      const hide =
        hidden ||
        String(menu.visible) === '1' ||
        menu.meta?.hideInMenu === true;
      if (menu.menuType === 'M') {
        walk(menu.children || [], path, hide);
        continue;
      }
      const copy: BackendMenu = {
        ...menu,
        path,
        meta: {
          title: menu.menuName || menu.meta?.title || '',
          ...menu.meta,
          ...(hide ? { hideInMenu: true } : {}),
        },
      };
      if (menu.component === 'ai/workbench/index') {
        homes.push({
          ...copy,
          menuName: 'AI 中台',
          path: '/ai/workbench',
          orderNum: -30,
          meta: { ...copy.meta, title: 'AI 中台', keepAlive: true },
        });
        continue;
      }
      if (
        ['dashboard/analytics/index', 'dashboard/workspace/index'].includes(
          menu.component || '',
        )
      ) {
        const workspace = menu.component === 'dashboard/workspace/index';
        homes.push({
          ...copy,
          path: workspace ? '/workspace' : '/analytics',
          orderNum: workspace ? -20 : -10,
        });
        continue;
      }
      if (menu.component === 'system/ai-template/index') {
        if (hasModelMenu) continue;
        copy.component = 'system/ai-config/index';
        copy.menuName = 'AI配置';
        copy.path = '/ai/configurations';
      }
      if (copy.component === 'system/business-config/index')
        copy.menuName = '业务配置';
      const component = copy.component || '';
      let group = 'business';
      if (
        [
          'system/ai-config/index',
          'system/config/index',
          'system/dict/index',
          'system/menu/index',
        ].includes(component)
      )
        group = 'system';
      if (/^monitor\/|^system\/job|^system\/ai-request/.test(component))
        group = 'operations';
      groups[group]?.children?.push(copy);
    }
  };
  walk(menus);
  const remaining = Object.values(groups)
    .filter((group) => group.children?.length)
    .map((group) => ({
      ...group,
      visible: group.children?.every(
        (child) => String(child.visible) === '1' || child.meta?.hideInMenu,
      )
        ? '1'
        : '0',
    }));
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
