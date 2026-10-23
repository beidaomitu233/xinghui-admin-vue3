import type { RouteRecordRaw } from 'vue-router';

/** A standalone filling surface; the server validates login/public capability on every request. */
export const lowcodeFillRoute: RouteRecordRaw = {
  name: 'LowcodeSharedFill',
  path: '/forms/fill/:token',
  component: () => import('#/views/lowcode/fill/index.vue'),
  meta: {
    title: '填写表单',
    hideInMenu: true,
    hideInTab: true,
    hideInBreadcrumb: true,
    ignoreAccess: true,
  },
};
