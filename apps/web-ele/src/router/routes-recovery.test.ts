import type {
  ComponentRecordType,
  RouteRecordStringComponent,
} from '@vben/types';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';

import { describe, expect, it, vi } from 'vitest';

import { generateAccessibleLocal } from './routes-helper';

async function setup(
  routes: RouteRecordStringComponent[],
  pageMap: ComponentRecordType = {},
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        name: 'Root',
        path: '/',
        component: RouterView,
        children: [
          {
            name: 'Profile',
            path: '/profile',
            component: { template: '<p>本人资料</p>' },
          },
          {
            name: 'PersonalNotificationInbox',
            path: '/notifications',
            component: { template: '<p>收件箱</p>' },
          },
        ],
      },
    ],
  });
  const result = await generateAccessibleLocal({
    router,
    routes: [],
    fetchMenuListAsync: async () => routes,
    layoutMap: {
      BasicLayout: RouterView as unknown as ComponentRecordType[string],
    },
    pageMap,
  });
  const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
    global: { plugins: [router] },
  });
  return { router, wrapper, ...result };
}
const node = (
  name: string,
  path: string,
  component: string,
): RouteRecordStringComponent => ({
  name,
  path,
  component,
  meta: { title: name },
});

describe('backend route recovery', () => {
  it('navigates nested directories and retains personal routes', async () => {
    const pageMap = {
      '../views/system/ai-model/index.vue': async () => ({
        default: { template: '<p>真实模型页</p>' },
      }),
    } as unknown as ComponentRecordType;
    const { router, wrapper } = await setup(
      [
        {
          ...node('AI', '/ai', 'BasicLayout'),
          children: [
            {
              ...node('Nested', '/ai/nested', 'BasicLayout'),
              children: [
                node('Model', '/ai/nested/model', 'system/ai-model/index'),
              ],
            },
          ],
        },
      ],
      pageMap,
    );
    await router.push('/ai');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/ai/nested/model');
    expect(wrapper.text()).toContain('真实模型页');
    expect(router.hasRoute('Profile')).toBe(true);
    expect(router.hasRoute('PersonalNotificationInbox')).toBe(true);
    wrapper.unmount();
  });
  it('changes URL and content on missing components', async () => {
    const { router, wrapper, accessibleMenus } = await setup([
      node('Missing', '/system/news', '/system/news/index'),
    ]);
    await router.push('/profile');
    await flushPromises();
    await router.push('/system/news');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/system/news');
    expect(wrapper.text()).toContain('此菜单的页面尚未接入');
    expect(wrapper.text()).not.toContain('本人资料');
    expect(wrapper.find('button').text()).toBe('重试加载页面');
    expect(accessibleMenus.map((menu) => menu.path).toSorted()).toEqual([
      '/system/news',
    ]);
    expect(
      accessibleMenus
        .find((menu) => menu.path === '/infra')
        ?.children?.map((menu) => menu.path),
    ).toEqual(undefined);
    wrapper.unmount();
  });
  it('retries rejected imports with a fresh document instead of cached rejection', async () => {
    const reload = vi
      .spyOn(window.location, 'reload')
      .mockImplementation(() => {});
    const loader = vi.fn().mockRejectedValue(new Error('network'));
    const { router, wrapper } = await setup(
      [node('Recover', '/recover', 'recover/index')],
      { '../views/recover/index.vue': loader },
    );
    await router.push('/recover');
    await flushPromises();
    expect(wrapper.text()).toContain('页面加载失败');
    await wrapper.get('button').trigger('click');
    await flushPromises();
    expect(reload).toHaveBeenCalledOnce();
    expect(loader).toHaveBeenCalledTimes(1);
    wrapper.unmount();
    reload.mockRestore();
  });
});
