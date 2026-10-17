import { createMemoryHistory, createRouter } from 'vue-router';

import { describe, expect, it } from 'vitest';

import { legacyAiRoutes } from './legacy-ai';

describe('aI compatibility deep links', () => {
  it.each(legacyAiRoutes)(
    'redirects $path through destination authorization without adding an editor',
    async (route) => {
      const router = createRouter({
        history: createMemoryHistory(),
        routes: [
          route,
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
