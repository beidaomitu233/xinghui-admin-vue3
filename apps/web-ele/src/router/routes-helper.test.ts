import type { Component } from 'vue';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, KeepAlive, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { preferences } from '@vben/preferences';

import { describe, expect, it } from 'vitest';

import { generateAccessibleLocal } from './routes-helper';

describe('lazy page cache lifecycle', () => {
  it('retains the transition root and cached page when imports resolve and menus change', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'Root', component: { template: '<router-view />' } },
      ],
    });
    let resolvePage!: (page: Component) => void;
    const pending = new Promise<Component>((resolve) => {
      resolvePage = resolve;
    });
    const { accessibleRoutes } = await generateAccessibleLocal({
      fetchMenuListAsync: async () => [
        {
          name: 'CachedChat',
          path: '/chat',
          component: 'chat',
          meta: { title: '中台', keepAlive: true },
        },
      ],
      pageMap: { '/chat': () => pending },
      router,
      routes: [],
    });
    const page = accessibleRoutes[0]?.component as Component;
    expect(page).toBeDefined();
    const shown = ref(true);
    const other = defineComponent({
      name: 'OtherPage',
      render: () => h('span', '配置页'),
    });
    const wrapper = mount(
      defineComponent({
        render: () =>
          h(KeepAlive, null, {
            default: () => (shown.value ? h(page) : h(other)),
          }),
      }),
    );
    const transitionRoot = wrapper.element;
    await flushPromises();
    expect(wrapper.text()).toContain('正在加载页面');
    resolvePage(
      defineComponent({
        render: () => h('input', { placeholder: '任务草稿' }),
      }),
    );
    await flushPromises();
    expect(wrapper.element).toBe(transitionRoot);
    await wrapper.get('input').setValue('保留任务');
    shown.value = false;
    await flushPromises();
    expect(wrapper.text()).toBe('配置页');
    shown.value = true;
    await flushPromises();
    expect(wrapper.element).toBe(transitionRoot);
    expect(wrapper.get('input').element.value).toBe('保留任务');
    wrapper.unmount();
  });
});

describe('empty menu access', () => {
  it('keeps a layout page and logout path without exposing management routes', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'Root', component: { template: '<router-view />' } },
        { path: '/:path(.*)*', name: 'FallbackNotFound', component: {} },
      ],
    });

    const { accessibleMenus, accessibleRoutes } = await generateAccessibleLocal(
      {
        fetchMenuListAsync: async () => [],
        router,
        routes: [],
      },
    );

    expect(accessibleMenus).toEqual([]);
    expect(accessibleRoutes).toHaveLength(1);
    const landing = router.resolve(preferences.app.defaultHomePath);
    expect(landing.name).toBe('NoAccessiblePages');
    expect(landing.matched[0]?.name).toBe('Root');
    expect(router.resolve('/system/user').name).toBe('FallbackNotFound');
    expect(router.resolve('/system/role').name).toBe('FallbackNotFound');
  });
});

describe('server-filtered platform menus', () => {
  it('registers only pages returned by the server', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'Root', component: { template: '<router-view />' } },
        { path: '/:path(.*)*', name: 'FallbackNotFound', component: {} },
      ],
    });
    const { accessibleRoutes } = await generateAccessibleLocal({
      fetchMenuListAsync: async () => [
        {
          name: 'UserPage',
          path: '/system/user',
          component: 'BasicLayout',
          meta: { title: '用户管理' },
        },
      ],
      layoutMap: { BasicLayout: async () => ({ template: '<div />' }) },
      router,
      routes: [],
    });

    expect(accessibleRoutes).toHaveLength(1);
    expect(router.resolve('/system/user').name).toBe('UserPage');
    expect(router.resolve('/system/config').name).toBe('FallbackNotFound');
    expect(router.resolve('/monitor/job').name).toBe('FallbackNotFound');
    expect(router.resolve('/monitor/operlog').name).toBe('FallbackNotFound');
  });
});
