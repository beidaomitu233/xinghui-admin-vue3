/* eslint-disable vue/one-component-per-file -- Popover/button ports isolate notification behavior from DOM focus implementation. */
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import Notification from '../../../../packages/effects/layouts/src/widgets/notification/notification.vue';

const context = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: context.push }) }));
vi.mock('@vben/locales', () => ({ $t: (key: string) => key }));
const ButtonPort = defineComponent({
  props: { disabled: Boolean },
  setup(props, { attrs, slots }) {
    return () =>
      h('button', { ...attrs, disabled: props.disabled }, slots.default?.());
  },
});
const PopoverPort = defineComponent({
  props: { open: Boolean },
  setup(props, { slots }) {
    return () =>
      h('section', [slots.trigger?.(), props.open ? slots.default?.() : null]);
  },
});
const ScrollPort = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.());
  },
});
function render(
  options: Parameters<typeof mount<typeof Notification>>[1] = {},
) {
  return mount(Notification, {
    ...options,
    global: {
      stubs: {
        VbenPopover: PopoverPort,
        Popover: PopoverPort,
        VbenButton: ButtonPort,
        VbenIconButton: ButtonPort,
        VbenScrollbar: ScrollPort,
      },
    },
  });
}

const item = {
  id: '9007199254740993',
  title: '通知',
  message: '正文',
  date: '2026-10-24',
  avatar: '',
  isRead: true,
  link: '/workspace',
};
beforeEach(() => {
  vi.clearAllMocks();
});
describe('existing native Notification compatibility extensions', () => {
  it('retains default internal navigation and existing clear/remove actions', async () => {
    const wrapper = render({ props: { open: true, notifications: [item] } });
    await wrapper.get('li').trigger('click');
    expect(context.push).toHaveBeenCalledWith({
      path: '/workspace',
      query: {},
      state: undefined,
    });
    expect(wrapper.emitted('itemClick')).toEqual([[item]]);
    expect(wrapper.text()).toContain('ui.widgets.clearNotifications');
    expect(wrapper.findAll('button')).toHaveLength(5);
    wrapper.unmount();
  });
  it('emits business clicks without navigating and omits unsupported actions when requested', async () => {
    const external = { ...item, link: 'https://example.invalid/private' };
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const wrapper = render({
      props: {
        open: true,
        notifications: [external],
        navigateOnClick: false,
        showClear: false,
        showRemove: false,
        markAllDisabled: true,
      },
    });
    await wrapper.get('li').trigger('click');
    expect(wrapper.emitted('itemClick')).toEqual([[external]]);
    expect(context.push).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain('ui.widgets.clearNotifications');
    expect(wrapper.findAll('button')).toHaveLength(3);
    expect(wrapper.findAll('button')[1]?.attributes('disabled')).toBeDefined();
    wrapper.unmount();
    open.mockRestore();
  });
  it('supports an empty/loading slot, accessible count label and controlled opening/closing', async () => {
    const wrapper = render({
      props: { triggerLabel: '个人通知，未读 7 条' },
      slots: { empty: () => h('p', '读取中') },
    });
    expect(wrapper.get('.bell-button').attributes('title')).toBe(
      '个人通知，未读 7 条',
    );
    expect(wrapper.text()).not.toContain('读取中');
    await wrapper.get('.bell-button').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('update:open')).toEqual([[true]]);
    expect(wrapper.text()).toContain('读取中');
    const viewAll = wrapper
      .findAll('button')
      .find((button) => button.text() === 'ui.widgets.viewAll');
    if (!viewAll) throw new Error('Native view-all missing');
    await viewAll.trigger('click');
    expect(wrapper.emitted('viewAll')).toEqual([[]]);
    expect(wrapper.emitted('update:open')).toEqual([[true], [false]]);
    expect(wrapper.text()).not.toContain('读取中');
    wrapper.unmount();
  });
});
