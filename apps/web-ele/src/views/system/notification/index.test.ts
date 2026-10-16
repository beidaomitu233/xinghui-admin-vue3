import type { PropType } from 'vue';

import type { PersonalNotification } from '#/api/system/personal-notification';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, inject, provide, ref } from 'vue';
import { createMemoryHistory, createRouter as makeRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requireTestFixture } from '#/test-utils/required-fixture';

import NotificationInboxPage from './index.vue';
import { registerNotificationRecordTargetValidator } from './target-navigation';

const mocks = vi.hoisted(() => ({
  getMyNotification: vi.fn(),
  listMyNotifications: vi.fn(),
  markMyNotificationRead: vi.fn(),
  markMyNotificationsRead: vi.fn(),
  refreshUnreadCount: vi.fn(),
  messageError: vi.fn(),
  messageInfo: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
}));

vi.mock('@vben/common-ui', () => ({
  Page: {
    props: ['title', 'description'],
    template: '<div><h1>{{ title }}</h1><slot /></div>',
  },
}));
vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userRoles: ['tenant-user'] }),
}));
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>();
  return {
    ...actual,
    ElMessage: {
      ...actual.ElMessage,
      error: mocks.messageError,
      info: mocks.messageInfo,
      success: mocks.messageSuccess,
      warning: mocks.messageWarning,
    },
  };
});
vi.mock('#/api/system/personal-notification', () => ({
  getMyNotification: mocks.getMyNotification,
  listMyNotifications: mocks.listMyNotifications,
  markMyNotificationRead: mocks.markMyNotificationRead,
  markMyNotificationsRead: mocks.markMyNotificationsRead,
}));
vi.mock('#/store/personal-notification', () => ({
  usePersonalNotificationStore: () => ({
    refreshUnreadCount: mocks.refreshUnreadCount,
  }),
}));

const tableContext = Symbol('notification-table-context');
type TableContext = {
  rows: () => PersonalNotification[];
  toggle: (row: PersonalNotification, checked: boolean) => void;
};

const TableStub = defineComponent({
  props: {
    data: {
      type: Array as PropType<PersonalNotification[]>,
      default: () => [],
    },
    emptyText: { type: String, default: '' },
  },
  emits: ['selection-change'],
  setup(props, { emit, slots }) {
    const selected = ref<PersonalNotification[]>([]);
    provide(tableContext, {
      rows: () => props.data,
      toggle(row, checked) {
        selected.value = checked
          ? [...selected.value.filter((item) => item.id !== row.id), row]
          : selected.value.filter((item) => item.id !== row.id);
        emit('selection-change', selected.value);
      },
    } satisfies TableContext);

    return () =>
      h(
        'div',
        { class: 'notification-table' },
        props.data.length > 0
          ? slots.default?.()
          : [h('div', { class: 'empty-text' }, props.emptyText)],
      );
  },
});

const TableColumnStub = defineComponent({
  props: {
    prop: String,
    type: String,
    selectable: Function as PropType<(row: PersonalNotification) => boolean>,
  },
  setup(props, { slots }) {
    const context = requireTestFixture(inject<TableContext>(tableContext));
    return () => {
      const rows = context.rows();
      if (props.type === 'selection') {
        return h(
          'div',
          rows.map((row) =>
            h('input', {
              type: 'checkbox',
              'aria-label': `select-${row.id}`,
              disabled: props.selectable ? !props.selectable(row) : false,
              onChange: (event: Event) =>
                context.toggle(row, (event.target as HTMLInputElement).checked),
            }),
          ),
        );
      }
      return h(
        'div',
        rows.map((row) =>
          props.prop
            ? h(
                'span',
                String(row[props.prop as keyof PersonalNotification] ?? ''),
              )
            : h('div', slots.default?.({ row })),
        ),
      );
    };
  },
});

const ButtonStub = defineComponent({
  props: { disabled: Boolean },
  setup(props, { attrs, slots }) {
    return () =>
      h('button', { ...attrs, disabled: props.disabled }, slots.default?.());
  },
});

const DialogStub = defineComponent({
  props: { modelValue: Boolean },
  emits: ['update:modelValue', 'closed'],
  setup(props, { emit, slots }) {
    return () =>
      props.modelValue
        ? h('div', { class: 'notification-dialog' }, [
            slots.default?.(),
            slots.footer?.(),
            h(
              'button',
              {
                onClick: () => {
                  emit('update:modelValue', false);
                  emit('closed');
                },
              },
              'close-dialog',
            ),
          ])
        : null;
  },
});

const ContainerStub = defineComponent({
  setup(_, { slots }) {
    return () => h('div', [slots.header?.(), slots.default?.()]);
  },
});

const unread: PersonalNotification = {
  id: 41,
  eventCode: 'sample_a.record_created',
  eventKey: 'browser-fixture-41',
  title: '资料已提交',
  body: '资料 N-41 已提交审核。',
  target: '/records/N-41',
  createTime: '2026-09-27T01:00:00',
  readTime: null,
};
const read = { ...unread, readTime: '2026-09-27T01:03:00' };

function createTestRouter() {
  return makeRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/notifications',
        name: 'PersonalNotificationInbox',
        component: { render: () => h('div') },
      },
      {
        path: '/records/:id',
        name: 'RecordDetails',
        component: { render: () => h('div') },
      },
      {
        path: '/infra/notice',
        name: 'SystemNotice',
        component: { render: () => h('div') },
      },
      {
        path: '/admin',
        name: 'AdminPage',
        component: { render: () => h('div') },
        meta: { authority: ['admin'], title: 'Admin' },
      },
      { path: '/:path(.*)*', name: 'FallbackNotFound', component: {} },
    ],
  });
}

async function createWrapper(query = '') {
  const router = createTestRouter();
  await router.push(`/notifications${query}`);
  await router.isReady();
  const wrapper = mount(NotificationInboxPage, {
    global: {
      plugins: [router],
      directives: { loading: () => {} },
      stubs: {
        'el-alert': {
          props: ['title'],
          template: '<div>{{ title }}<slot /></div>',
        },
        'el-button': ButtonStub,
        'el-card': ContainerStub,
        'el-dialog': DialogStub,
        'el-pagination': true,
        'el-radio-button': { template: '<button><slot /></button>' },
        'el-radio-group': ContainerStub,
        'el-table': TableStub,
        'el-table-column': TableColumnStub,
        'el-tag': { template: '<span><slot /></span>' },
      },
    },
  });
  return { router, wrapper };
}

describe('personal notification inbox page', () => {
  let unregisterTargetCheckers: Array<() => void> = [];

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.listMyNotifications.mockResolvedValue({
      items: [unread],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    });
    mocks.getMyNotification.mockResolvedValue(unread);
    mocks.markMyNotificationRead.mockResolvedValue(1);
    mocks.markMyNotificationsRead.mockResolvedValue(1);
    mocks.refreshUnreadCount.mockResolvedValue(undefined);
  });

  afterEach(() => {
    unregisterTargetCheckers.forEach((unregister) => unregister());
    unregisterTargetCheckers = [];
  });

  it('loads a page, opens the owner detail, marks it read, and refreshes count/list', async () => {
    mocks.listMyNotifications
      .mockResolvedValueOnce({
        items: [unread],
        total: 1,
        pageNum: 1,
        pageSize: 10,
      })
      .mockResolvedValueOnce({
        items: [read],
        total: 1,
        pageNum: 1,
        pageSize: 10,
      });
    mocks.getMyNotification
      .mockResolvedValueOnce(unread)
      .mockResolvedValueOnce(read);
    const { wrapper } = await createWrapper();
    await flushPromises();

    expect(mocks.listMyNotifications).toHaveBeenCalledWith({
      pageNum: 1,
      pageSize: 10,
      unreadOnly: undefined,
    });
    expect(wrapper.text()).toContain(unread.title);

    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('查看详情')),
    ).trigger('click');
    await flushPromises();
    expect(mocks.getMyNotification).toHaveBeenCalledWith(unread.id);
    expect(wrapper.text()).toContain(unread.body);

    await requireTestFixture(
      wrapper.findAll('button').find((button) => button.text() === '标记已读'),
    ).trigger('click');
    await flushPromises();
    expect(mocks.markMyNotificationRead).toHaveBeenCalledWith(unread.id);
    expect(mocks.listMyNotifications).toHaveBeenCalledTimes(2);
    expect(mocks.refreshUnreadCount).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('supports batch read for selected unread notifications', async () => {
    const second = { ...unread, id: 42, title: '资料已更新' };
    mocks.listMyNotifications.mockResolvedValue({
      items: [unread, second],
      total: 2,
      pageNum: 1,
      pageSize: 10,
    });
    const { wrapper } = await createWrapper();
    await flushPromises();

    await wrapper.find('input[aria-label="select-41"]').setValue(true);
    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('批量标记已读（1）')),
    ).trigger('click');
    await flushPromises();

    expect(mocks.markMyNotificationsRead).toHaveBeenCalledWith([41]);
    expect(mocks.refreshUnreadCount).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('shows an empty state and an actionable retry after list failure', async () => {
    mocks.listMyNotifications
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ items: [], total: 0, pageNum: 1, pageSize: 10 });
    const { wrapper } = await createWrapper();
    await flushPromises();
    expect(wrapper.text()).toContain('通知加载失败，请重试');

    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('重新加载')),
    ).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('暂无通知');
    expect(mocks.listMyNotifications).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('does not request details for a malformed ID in the inbox URL', async () => {
    const { wrapper } = await createWrapper('?notificationId=not-a-number');
    await flushPromises();
    expect(mocks.getMyNotification).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('通知已失效或无访问权限');
    wrapper.unmount();
  });

  it('keeps the inbox open when the current role cannot access a target route', async () => {
    mocks.getMyNotification.mockResolvedValue({ ...unread, target: '/admin' });
    const { router, wrapper } = await createWrapper();
    await flushPromises();
    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('查看详情')),
    ).trigger('click');
    await flushPromises();
    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('打开关联页面')),
    ).trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('PersonalNotificationInbox');
    wrapper.unmount();
  });

  it('navigates to an approved list-level business target', async () => {
    mocks.getMyNotification.mockResolvedValue({
      ...unread,
      target: '/infra/notice',
    });
    const { router, wrapper } = await createWrapper();
    await flushPromises();
    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('查看详情')),
    ).trigger('click');
    await flushPromises();
    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('打开关联页面')),
    ).trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('SystemNotice');
    wrapper.unmount();
  });

  it('stays in the inbox when a record route has no registered checker', async () => {
    mocks.getMyNotification.mockResolvedValue({
      ...unread,
      target: '/records/N-404',
    });
    const { router, wrapper } = await createWrapper();
    await flushPromises();
    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('查看详情')),
    ).trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain(
      '该通知的关联页面暂时无法打开，请联系管理员。',
    );

    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('打开关联页面')),
    ).trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.name).toBe('PersonalNotificationInbox');
    expect(mocks.messageInfo).toHaveBeenCalledWith(
      '该通知的关联页面暂时无法打开，请联系管理员。',
    );
    wrapper.unmount();
  });

  it('stays in the inbox when the business checker reports a deleted record', async () => {
    const checker = vi.fn().mockResolvedValue('missing');
    unregisterTargetCheckers.push(
      registerNotificationRecordTargetValidator('RecordDetails', checker),
    );
    mocks.getMyNotification.mockResolvedValue({
      ...unread,
      target: '/records/N-404',
    });
    const { router, wrapper } = await createWrapper();
    await flushPromises();
    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('查看详情')),
    ).trigger('click');
    await flushPromises();
    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('打开关联页面')),
    ).trigger('click');
    await flushPromises();

    expect(checker).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.name).toBe('PersonalNotificationInbox');
    expect(mocks.messageInfo).toHaveBeenCalledWith(
      '目标记录不存在或已失效，已留在通知列表',
    );
    wrapper.unmount();
  });

  it('stays in the inbox when the business checker denies access', async () => {
    const checker = vi.fn().mockResolvedValue('forbidden');
    unregisterTargetCheckers.push(
      registerNotificationRecordTargetValidator('RecordDetails', checker),
    );
    mocks.getMyNotification.mockResolvedValue({
      ...unread,
      target: '/records/N-41',
    });
    const { router, wrapper } = await createWrapper();
    await flushPromises();
    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('查看详情')),
    ).trigger('click');
    await flushPromises();
    await requireTestFixture(
      wrapper
        .findAll('button')
        .find((button) => button.text().includes('打开关联页面')),
    ).trigger('click');
    await flushPromises();

    expect(checker).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.name).toBe('PersonalNotificationInbox');
    expect(mocks.messageWarning).toHaveBeenCalledWith(
      '当前账号无权访问目标记录，已留在通知列表',
    );
    wrapper.unmount();
  });
});
