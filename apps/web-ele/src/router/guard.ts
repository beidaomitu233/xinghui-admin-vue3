import type { Router, RouteRecordRaw } from 'vue-router';

import { LOGIN_PATH } from '@vben/constants';
import { preferences } from '@vben/preferences';
import { useAccessStore, useUserStore } from '@vben/stores';
import { startProgress, stopProgress } from '@vben/utils';

import { accessRoutes, coreRouteNames } from '#/router/routes';
import { useAuthStore } from '#/store';

import { generateAccess } from './access';

function findFirstAccessiblePath(routes: RouteRecordRaw[]): string | undefined {
  for (const route of routes) {
    const children = 'children' in route ? route.children : undefined;
    const childPath = children?.length
      ? findFirstAccessiblePath(children)
      : undefined;
    if (childPath) return childPath;

    if (route.name === 'NoAccessiblePages' && route.path) return route.path;
    if (
      route.path &&
      route.meta?.hideInMenu !== true &&
      'component' in route &&
      route.component
    ) {
      return route.path;
    }
  }
}

/**
 * 通用守卫配置
 * @param router
 */
function setupCommonGuard(router: Router) {
  // 记录已经加载的页面
  const loadedPaths = new Set<string>();

  router.onError(() => stopProgress());

  router.beforeEach((to) => {
    to.meta.loaded = loadedPaths.has(to.path);

    // 页面加载进度条
    if (!to.meta.loaded && preferences.transition.progress) {
      startProgress();
    }
    return true;
  });

  router.afterEach((to) => {
    // 记录页面是否加载,如果已经加载，后续的页面切换动画等效果不在重复执行

    loadedPaths.add(to.path);

    // 关闭页面加载进度条
    if (preferences.transition.progress) {
      stopProgress();
    }
  });
}

/**
 * 权限访问守卫配置
 * @param router
 */
function setupAccessGuard(router: Router) {
  router.beforeEach(async (to, from) => {
    const accessStore = useAccessStore();
    const userStore = useUserStore();
    const authStore = useAuthStore();

    // 基本路由，这些路由不需要进入权限拦截
    if (
      coreRouteNames.includes(to.name as string) &&
      to.name !== 'PersonalNotificationInbox' &&
      to.name !== 'Profile'
    ) {
      if (to.path === LOGIN_PATH && accessStore.accessToken) {
        return decodeURIComponent(
          (to.query?.redirect as string) ||
            userStore.userInfo?.homePath ||
            preferences.app.defaultHomePath,
        );
      }
      return true;
    }

    // accessToken 检查
    if (!accessStore.accessToken) {
      // 明确声明忽略权限访问权限，则可以访问
      if (to.meta.ignoreAccess) {
        return true;
      }

      // 没有访问权限，跳转登录页面
      if (to.fullPath !== LOGIN_PATH) {
        return {
          path: LOGIN_PATH,
          // 如不需要，直接删除 query
          query:
            to.fullPath === preferences.app.defaultHomePath
              ? {}
              : { redirect: encodeURIComponent(to.fullPath) },
          // 携带当前跳转的页面，登录后重新跳转该页面
          replace: true,
        };
      }
      return to;
    }

    // 是否已经生成过动态路由
    if (accessStore.isAccessChecked) {
      return true;
    }

    // 生成路由表
    // 当前登录用户拥有的角色标识列表
    let userInfo;
    try {
      userInfo = await authStore.fetchUserInfo();
    } catch (error) {
      if (!accessStore.accessToken) return { path: LOGIN_PATH, replace: true };
      if (to.name === 'Profile') {
        // Keep only the protected error/retry shell on transient info failures.
        // Profile renders no identity until initialization has succeeded.
        userStore.setUserInfo(null);
        accessStore.setAccessCodes([]);
        to.meta.profileInfoFailed = true;
        return true;
      }
      throw error;
    }
    to.meta.profileInfoFailed = false;
    const userRoles = userInfo.roles ?? [];

    // 生成菜单和路由
    const { accessibleMenus, accessibleRoutes } = await generateAccess({
      roles: userRoles,
      router,
      // 则会在菜单中显示，但是访问会被重定向到403
      routes: accessRoutes,
    });

    // 保存菜单信息和路由信息
    accessStore.setAccessMenus(accessibleMenus);
    accessStore.setAccessRoutes(accessibleRoutes);
    accessStore.setIsAccessChecked(true);
    const redirectPath = (from.query.redirect ??
      (to.path === preferences.app.defaultHomePath
        ? userInfo.homePath || preferences.app.defaultHomePath
        : to.fullPath)) as string;

    const targetPath = decodeURIComponent(redirectPath);
    const homePath = userInfo.homePath || preferences.app.defaultHomePath;
    const invalidHomeRoute =
      !from.query.redirect &&
      targetPath === homePath &&
      router.resolve(targetPath).name === 'FallbackNotFound';
    const roleVisibleFallback = invalidHomeRoute
      ? findFirstAccessiblePath(accessibleRoutes)
      : undefined;

    return {
      ...router.resolve(roleVisibleFallback || targetPath),
      replace: true,
    };
  });
}

/**
 * 项目守卫配置
 * @param router
 */
function createRouterGuard(router: Router) {
  /** 通用 */
  setupCommonGuard(router);
  /** 权限访问 */
  setupAccessGuard(router);
}

export { createRouterGuard };
