import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import MenuView from '../../../packages/@core/ui-kit/menu-ui/src/menu.vue';

const menus = [
  {
    name: '系统管理',
    path: '/system',
    children: [{ name: '用户', path: '/system/user' }],
  },
  {
    name: 'AI管理',
    path: '/ai',
    children: [{ name: '模型', path: '/ai/model' }],
  },
];
const wrappers: ReturnType<typeof mount>[] = [];
function render(props = {}) {
  const wrapper = mount(MenuView, {
    props: {
      menus,
      accordion: false,
      expansionKey: 'test:account-a',
      ...props,
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}
const opened = (wrapper: ReturnType<typeof mount>) =>
  wrapper
    .findAll('li.vben-sub-menu.is-opened')
    .map((item) => item.attributes('aria-label'));
const toggle = async (wrapper: ReturnType<typeof mount>, title: string) => {
  await wrapper
    .get(`li.vben-sub-menu[aria-label="${title}"] > .vben-sub-menu-content`)
    .trigger('click');
  await nextTick();
};
describe('mounted navigation groups', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  });
  it('keeps two groups open, closes independently and restores refresh including all closed', async () => {
    const wrapper = render();
    await toggle(wrapper, '系统管理');
    await toggle(wrapper, 'AI管理');
    expect(opened(wrapper)).toEqual(['系统管理', 'AI管理']);
    await toggle(wrapper, '系统管理');
    expect(opened(wrapper)).toEqual(['AI管理']);
    const refreshed = render();
    await nextTick();
    expect(opened(refreshed)).toEqual(['AI管理']);
    await toggle(refreshed, 'AI管理');
    const closed = render({ defaultActive: '/ai/model' });
    await nextTick();
    expect(opened(closed)).toEqual([]);
  });
  it('restores asynchronously registered permitted groups, collapse roundtrip and account isolation', async () => {
    localStorage.setItem(
      'test:account-a',
      JSON.stringify(['/system', '/ai', '/secret']),
    );
    const wrapper = render({ menus: [] });
    await nextTick();
    expect(opened(wrapper)).toEqual([]);
    await wrapper.setProps({ menus });
    await nextTick();
    expect(opened(wrapper)).toEqual(['系统管理', 'AI管理']);
    await wrapper.setProps({ collapse: true });
    await wrapper.setProps({ collapse: false });
    await nextTick();
    expect(opened(wrapper)).toEqual(['系统管理', 'AI管理']);
    await wrapper.setProps({ menus: menus.slice(1) });
    await nextTick();
    expect(opened(wrapper)).toEqual(['AI管理']);
    await wrapper.setProps({ expansionKey: 'test:account-b' });
    await nextTick();
    expect(opened(wrapper)).toEqual([]);
    await wrapper.setProps({ expansionKey: 'test:account-a', menus });
    await nextTick();
    expect(opened(wrapper)).toEqual(['系统管理', 'AI管理']);
  });
});
