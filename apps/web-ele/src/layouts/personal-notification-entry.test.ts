/* eslint-disable vue/one-component-per-file -- Parent business regression uses local native-component ports. */
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, watch } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requireTestFixture } from '#/test-utils/required-fixture';

import PersonalNotificationEntry from './personal-notification-entry.vue';

const mocks = vi.hoisted(() => ({
  getMyUnreadCount: vi.fn(),
  listMyNotifications: vi.fn(),
  markMyNotificationsRead: vi.fn(),
}));

vi.mock('#/api/system/personal-notification', () => ({
  getMyUnreadCount: mocks.getMyUnreadCount,
  listMyNotifications: mocks.listMyNotifications,
  markMyNotificationsRead: mocks.markMyNotificationsRead,
}));

vi.mock('@vben/common-ui', async () => {
  const { useModalPort } = await import('#/test-utils/popup-port');
  return { useVbenDrawer: useModalPort };
});
vi.mock('#/layouts/notification-center.vue', () => ({
  default: {
    name: 'NotificationCenter',
    template: '<div class="notification-center-content">完整通知中心</div>',
  },
}));
vi.mock('@vben/layouts', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    Notification: defineComponent({
      name: 'NotificationUnitPort',
      props: { open: Boolean, triggerLabel: { type: String, default: '' } },
      emits: ['update:open', 'viewAll'],
      setup(props, { emit, slots }) {
        return () =>
          h('section', [
            h(
              'button',
              {
                'aria-label': props.triggerLabel,
                onClick: () => emit('update:open', !props.open),
              },
              '通知',
            ),
            props.open
              ? h('div', [
                  slots.empty?.(),
                  h('button', { onClick: () => emit('viewAll') }, '查看全部'),
                ])
              : null,
          ]);
      },
    }),
  };
});
const PopoverStub = defineComponent({
  props: { visible: Boolean },
  emits: ['show'],
  setup(props, { emit, slots }) {
    watch(
      () => props.visible,
      (visible) => {
        if (visible) emit('show');
      },
    );
    return () =>
      h('div', [slots.reference?.(), props.visible ? slots.default?.() : null]);
  },
});

const ButtonStub = defineComponent({
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('button', attrs, slots.default?.());
  },
});

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/workspace',
        name: 'Workspace',
        component: { render: () => h('div') },
      },
      {
        path: '/notifications',
        name: 'PersonalNotificationInbox',
        component: { render: () => h('div') },
      },
    ],
  });
}

describe('personal notification header entry', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAccessStore().setAccessToken('test-token');
    vi.resetAllMocks();
    mocks.getMyUnreadCount.mockResolvedValue(7);
    mocks.listMyNotifications.mockResolvedValue({
      items: [],
      total: 0,
      pageNum: 1,
      pageSize: 5,
    });
    mocks.markMyNotificationsRead.mockResolvedValue(0);
  });

  it('shows the live unread count, loads a personal preview, and opens the inbox', async () => {
    const router = createTestRouter();
    await router.push('/workspace');
    const wrapper = mount(PersonalNotificationEntry, {
      global: {
        plugins: [router],
        stubs: {
          NotificationCenter: {
            template:
              '<div class="notification-center-content">完整通知中心</div>',
          },
          'el-drawer': {
            props: ['modelValue'],
            template:
              '<div v-if="modelValue" class="center-drawer"><slot /></div>',
          },
          'el-badge': {
            props: ['value'],
            template: '<span class="badge-value">{{ value }}<slot /></span>',
          },
          'el-alert': {
            props: ['title'],
            template: '<div>{{ title }}<slot /></div>',
          },
          'el-button': ButtonStub,
          'el-popover': PopoverStub,
          'el-tag': { template: '<span><slot /></span>' },
        },
      },
    });
    await flushPromises();

    expect(
      wrapper.get('button[aria-label]').attributes('aria-label'),
    ).toContain('未读 7 条');
    await wrapper.find('button[aria-label^="个人通知"]').trigger('click');
    await flushPromises();
    expect(mocks.listMyNotifications).toHaveBeenCalledWith({
      pageNum: 1,
      pageSize: 5,
    });
    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('查看全部')),
    ).trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.name).toBe('Workspace');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.find('.notification-center-content').exists()).toBe(true);
    await router.push('/notifications?notificationId=41');
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    useAccessStore().setAccessToken(null);
    await flushPromises();
    expect(
      wrapper.get('button[aria-label]').attributes('aria-label'),
    ).not.toContain('未读 7 条');
    expect(
      wrapper.get('button[aria-label]').attributes('aria-label'),
    ).toContain('未读数暂不可用');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
