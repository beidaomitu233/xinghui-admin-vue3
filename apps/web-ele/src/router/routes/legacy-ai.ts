import type { RouteRecordRaw } from 'vue-router';

/** Normal-mode compatibility only. Targets still pass normal backend menu authorization. */
const redirects: [string, string][] = [
  ['/ai/model', '/ai/requests?settings=keys'],
  ['/system/ai-model', '/ai/requests?settings=keys'],
  ['/ai/configurations', '/ai/requests?settings=keys'],
  ['/ai/applications', '/ai/templates'],
  ['/ai/prompts', '/ai/templates'],
  ['/system/ai-prompt', '/ai/templates'],
];
export const legacyAiRoutes: RouteRecordRaw[] = redirects.map(
  ([path, target], index) => ({
    path,
    name: `LegacyAiRedirect${index}`,
    redirect: target,
    meta: {
      hideInBreadcrumb: true,
      hideInMenu: true,
      hideInTab: true,
      title: 'AI管理',
    },
  }),
);
