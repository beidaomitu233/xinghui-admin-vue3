import type { RouteRecordRaw } from 'vue-router';

/** Compatibility deep link only. The destination still passes the access guard. */
export const legacyWechatConfigRoute: RouteRecordRaw = {
  name: 'LegacyWechatConfigRedirect',
  path: '/system/wechat',
  redirect: {
    path: '/system/business-config',
    query: { section: 'wechat' },
  },
  meta: {
    hideInBreadcrumb: true,
    hideInMenu: true,
    hideInTab: true,
    title: '微信业务配置',
  },
};
