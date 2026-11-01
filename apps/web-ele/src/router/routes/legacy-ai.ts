import type { RouteRecordRaw } from 'vue-router';

/** Normal-mode compatibility only. Targets still pass normal backend menu authorization. */
const redirects: [string, string][] = [
  ['/ai/model', '/ai/configurations'],
  ['/system/ai-model', '/ai/configurations'],
  ['/ai/templates', '/ai/configurations'],
  ['/ai/applications', '/ai/configurations'],
  ['/ai/prompts', '/ai/configurations'],
  ['/system/ai-prompt', '/ai/configurations'],
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
