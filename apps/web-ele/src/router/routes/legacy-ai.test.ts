import { createMemoryHistory, createRouter } from 'vue-router';

import { describe, expect, it } from 'vitest';

import { legacyAiRoutes } from './legacy-ai';

describe('aI compatibility deep links', () => {
  it('keeps the channel management route independent of monitor redirects', () => {
    expect(
      legacyAiRoutes.some((route) => route.path === '/ai/configurations'),
    ).toBe(false);
    for (const path of ['/ai/model', '/system/ai-model'])
      expect(
        legacyAiRoutes.find((route) => route.path === path)?.redirect,
      ).toBe('/ai/configurations');
  });
  it.each(legacyAiRoutes)(
    'redirects $path through destination authorization without adding an editor',
    async (route) => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          route,
          { path: '/ai/configurations', component: {}, name: 'Configurations' },
          { path: '/ai/requests', component: {}, name: 'Monitor' },
          { path: '/ai/templates', component: {}, name: 'Templates' },
          { path: '/auth/login', component: {}, name: 'Login' },
        ],
      });
      const checked: string[] = [];
      router.beforeEach((target) => {
        checked.push(target.path);
        return target.path.startsWith('/ai/') ? '/auth/login' : true;
      });
      await router.push(route.path);
      expect(checked).toContain(String(route.redirect).split('?')[0]);
      expect(router.currentRoute.value.name).toBe('Login');
      expect(route.meta?.hideInMenu).toBe(true);
      expect(route).not.toHaveProperty('component');
    },
  );
});
