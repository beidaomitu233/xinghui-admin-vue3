import { createMemoryHistory, createRouter } from 'vue-router';

import { describe, expect, it } from 'vitest';

import { legacyWechatConfigRoute } from './legacy-wechat';

function router() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      legacyWechatConfigRoute,
      {
        path: '/system/business-config',
        name: 'BusinessConfig',
        component: { template: '<div />' },
      },
      {
        path: '/auth/login',
        name: 'Login',
        component: { template: '<div />' },
      },
      {
        path: '/:path(.*)*',
        name: 'NotFound',
        component: { template: '<div />' },
      },
    ],
  });
}

describe('legacy wechat deep link', () => {
  it('redirects to the exact unified section instead of the 404 fallback', async () => {
    const instance = router();
    await instance.push('/system/wechat');
    expect(instance.currentRoute.value.name).toBe('BusinessConfig');
    expect(instance.currentRoute.value.fullPath).toBe(
      '/system/business-config?section=wechat',
    );
    expect(legacyWechatConfigRoute.meta?.hideInMenu).toBe(true);
  });
  it('delivers the destination to the guard so denied access cannot enter it', async () => {
    const instance = router();
    const guarded: string[] = [];
    instance.beforeEach((target) => {
      guarded.push(target.fullPath);
      return target.path === '/system/business-config' ? '/auth/login' : true;
    });
    await instance.push('/system/wechat');
    expect(guarded).toContain('/system/business-config?section=wechat');
    expect(instance.currentRoute.value.name).toBe('Login');
  });
});
