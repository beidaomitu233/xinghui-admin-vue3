import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    name: 'LowcodeRuntime',
    path: '/lowcode/runtime/:formId',
    component: () => import('#/views/lowcode/runtime/index.vue'),
    meta: { title: '填写表单', hideInMenu: true },
  },
  {
    name: 'LowcodeRecords',
    path: '/lowcode/records/:formId',
    component: () => import('#/views/lowcode/records/index.vue'),
    meta: { title: '表单数据', hideInMenu: true },
  },
];

export { routes as lowcodeRuntimeRoutes };
export default routes;
