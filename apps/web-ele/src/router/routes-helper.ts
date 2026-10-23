import type { Component } from 'vue';
import type { RouteRecordRaw } from 'vue-router';

import type {
  ComponentRecordType,
  GenerateMenuAndRoutesOptions,
  RouteRecordStringComponent,
} from '@vben/types';

import {
  defineComponent,
  h,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
} from 'vue';
import { RouterView } from 'vue-router';

import { preferences } from '@vben/preferences';
import { cloneDeep, generateMenus, mapTree } from '@vben/utils';

import RouteError from '../views/_core/fallback/route-error.vue';
import { lowcodeRuntimeRoutes } from './routes/modules/lowcode';

/**
 * 本地版本的 generateAccessible，包含完整的路由注册和菜单生成
 * 用于后端动态路由模式
 */
async function generateAccessibleLocal(options: GenerateMenuAndRoutesOptions) {
  const { router } = options;

  options.routes = cloneDeep(options.routes);

  // 生成路由
  const accessibleRoutes = await generateRoutesLocal(options);

  const root = router.getRoutes().find((item) => item.path === '/');

  // 获取已有的路由名称列表
  const names = root?.children?.map((item) => item.name) ?? [];

  // 动态添加到router实例内
  accessibleRoutes.forEach((route) => {
    if (root && !route.meta?.noBasicLayout) {
      // 如果包含子路由，则将component移除
      if (route.children && route.children.length > 0) {
        delete route.component;
      }
      // 根据router name判断，如果路由已经存在，则更新
      if (names?.includes(route.name)) {
        const index = root.children?.findIndex(
          (item) => item.name === route.name,
        );
        if (index !== undefined && index !== -1 && root.children) {
          root.children[index] = route;
        }
      } else {
        root.children?.push(route);
      }
    } else {
      router.addRoute(route);
    }
  });

  if (root) {
    if (root.name) {
      router.removeRoute(root.name);
    }
    router.addRoute(root);
  }

  // Register authenticated runtime pages after rebuilding Root, without adding menu entries.
  for (const route of lowcodeRuntimeRoutes) {
    if (root?.name && route.name && !router.hasRoute(route.name)) {
      router.addRoute(root.name, route);
    }
  }

  // 生成菜单
  const accessibleMenus = generateMenus(accessibleRoutes, options.router);

  return { accessibleMenus, accessibleRoutes };
}

/**
 * 本地路由生成逻辑
 */
async function generateRoutesLocal(
  options: GenerateMenuAndRoutesOptions,
): Promise<RouteRecordRaw[]> {
  const { fetchMenuListAsync, layoutMap = {}, pageMap = {} } = options;

  const menuRoutes = await fetchMenuListAsync?.();
  if (!menuRoutes) {
    return [];
  }
  if (menuRoutes.length === 0) {
    return [
      {
        name: 'NoAccessiblePages',
        path: preferences.app.defaultHomePath,
        component: () => import('../views/_core/fallback/no-access.vue'),
        meta: {
          title: '暂无可访问页面',
          hideInMenu: true,
          hideInTab: true,
        },
      },
    ];
  }

  const normalizePageMap: ComponentRecordType = {};

  for (const [key, value] of Object.entries(pageMap)) {
    // 保留原始键
    normalizePageMap[key] = value;

    // 添加标准化后的键
    const normalizedKey = normalizeViewPath(key);
    normalizePageMap[normalizedKey] = value;

    // 添加不带 .vue 后缀的键
    if (normalizedKey.endsWith('.vue')) {
      const keyWithoutVue = normalizedKey.slice(0, -4);
      normalizePageMap[keyWithoutVue] = value;

      // 如果是 index.vue，也添加不带 /index 的路径
      if (keyWithoutVue.endsWith('/index')) {
        normalizePageMap[keyWithoutVue.slice(0, -6)] = value;
      }
    }
  }

  let resultRoutes = convertRoutes(menuRoutes, layoutMap, normalizePageMap);

  // 调整路由树：添加redirect、处理keepAlive组件名称
  resultRoutes = mapTree(resultRoutes, (route) => {
    // 如果有redirect或者没有子路由，则直接返回
    if (route.redirect || !route.children || route.children.length === 0) {
      return route;
    }
    const firstChild = route.children[0];

    // 如果子路由以/开头，设置redirect
    if (firstChild?.path?.startsWith('/')) {
      route.redirect = firstChild.path;
    }

    return route;
  });

  return resultRoutes;
}

function convertRoutes(
  routes: RouteRecordStringComponent[],
  layoutMap: ComponentRecordType,
  pageMap: ComponentRecordType,
): RouteRecordRaw[] {
  return mapTree(routes, (node) => {
    const route = node as unknown as RouteRecordRaw;
    const { component, name } = node;

    if (!name) {
      console.error('route name is required', route);
    }

    // layout转换
    if (component && layoutMap[component]) {
      route.component = route.children?.length
        ? RouterView
        : layoutMap[component];
    } else {
      const normalizePath = normalizeViewPath(component || '__missing_page__');
      // 移除开头的斜杠
      const pathWithoutLeadingSlash = normalizePath.replace(/^\//, '');

      // 尝试多种可能的键格式
      const possibleKeys = [
        // 直接匹配
        normalizePath,
        `${normalizePath}.vue`,
        pathWithoutLeadingSlash,
        `${pathWithoutLeadingSlash}.vue`,
        // 相对路径格式 (import.meta.glob 输出格式)
        `../views/${pathWithoutLeadingSlash}.vue`,
        `../views/${pathWithoutLeadingSlash}/index.vue`,
        // 添加 /index 后缀
        `${normalizePath}/index`,
        `${normalizePath}/index.vue`,
        `${pathWithoutLeadingSlash}/index.vue`,
        `../views/${pathWithoutLeadingSlash}`,
      ];

      const matchedKey = possibleKeys.find((key) => pageMap[key]);

      const matchedPage = matchedKey ? pageMap[matchedKey] : undefined;
      route.component = matchedPage
        ? createRecoverablePage(matchedPage, String(name))
        : defineComponent({
            name: String(name),
            setup: () => () =>
              h(RouteError, {
                missing: true,
                retry: () => window.location.reload(),
              }),
          });
    }

    return route;
  });
}

/** Resolve resources inside the page so a failed import cannot abort navigation. */
function createRecoverablePage(loader: () => Promise<Component>, name: string) {
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const page = shallowRef<Component>();
      const loading = ref(false);
      let requestId = 0;
      const load = async () => {
        const current = ++requestId;
        page.value = undefined;
        loading.value = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const loaded = await Promise.race([
            loader(),
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('Page load timeout')),
                20_000,
              );
            }),
          ]);
          if (current === requestId) {
            page.value = (
              'default' in loaded ? loaded.default : loaded
            ) as Component;
          }
        } catch {
          // Render the retry page; do not restore a previous route's content.
        } finally {
          clearTimeout(timer);
          if (current === requestId) loading.value = false;
        }
      };
      onMounted(load);
      onUnmounted(() => {
        requestId++;
      });
      return () => {
        if (page.value) return h(page.value, attrs, slots);
        if (loading.value) {
          return h(
            'section',
            { role: 'status', class: 'p-8' },
            '正在加载页面…',
          );
        }
        // Browsers cache rejected imports; a fresh document retries resources.
        return h(RouteError, { retry: () => window.location.reload() });
      };
    },
  });
}
function normalizeViewPath(path: string): string {
  const normalizedPath = path.replace(/^(\.\/|\.\.\/)+/, '');
  const viewPath = normalizedPath.startsWith('/')
    ? normalizedPath
    : `/${normalizedPath}`;
  return viewPath.replace(/^\/views/, '');
}

export { generateAccessibleLocal };
