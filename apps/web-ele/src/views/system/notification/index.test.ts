/* eslint-disable vue/one-component-per-file -- Parent inbox regression uses local UI ports. */
import type { PersonalNotification } from '#/api/system/personal-notification';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter as makeRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NotificationInboxPage from '#/layouts/notification-center.vue';
import { requireTestFixture } from '#/test-utils/required-fixture';

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

vi.mock('@vben/common-ui', async (importOriginal) => {
  const actual = await importOriginal<object>();
  const { useModalPort } = await import('#/test-utils/popup-port');
  return { ...actual, useVbenModal: useModalPort };
});
vi.mock('#/adapter/vxe-table', async () => {
  const { useGridPort } = await import('#/test-utils/vxe-grid-port');
  return { useVbenVxeGrid: useGridPort };
});
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

async function createWrapper(query = '', path = '/notifications') {
  const router = createTestRouter();
  await router.push(`${path}${query}`);
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
        'el-tag': { template: '<span><slot /></span>' },
      },
    },
  });
  return { router, wrapper };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('not initialized');
  };
  let reject: (reason: Error) => void = () => {
    throw new Error('not initialized');
  };
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('header notification center', () => {
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

  it('keeps the last page when an older page response arrives later', async () => {
    mocks.listMyNotifications.mockResolvedValue({
      items: [unread],
      total: 31,
      pageNum: 1,
      pageSize: 10,
    });
    const { wrapper } = await createWrapper();
    await flushPromises();
    const old = deferred<{
      items: PersonalNotification[];
      pageNum: number;
      pageSize: number;
      total: number;
    }>();
    mocks.listMyNotifications
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({
        items: [{ ...unread, title: 'Latest page' }],
        total: 31,
        pageNum: 3,
        pageSize: 10,
      });
    const pagination = wrapper.findComponent({ name: 'VxePagerUnitPort' });
    pagination.vm.$emit('current-change', 2);
    await flushPromises();
    pagination.vm.$emit('current-change', 3);
    await flushPromises();
    old.resolve({
      items: [{ ...unread, title: 'Stale page' }],
      total: 31,
      pageNum: 2,
      pageSize: 10,
    });
    await flushPromises();
    expect(wrapper.text()).toContain('Latest page');
    expect(wrapper.text()).not.toContain('Stale page');
    expect(wrapper.text()).not.toContain('通知加载失败');
    wrapper.unmount();
  });

  it('requeries after a successful read collides with an older request for the same page and filters', async () => {
    const { wrapper } = await createWrapper();
    await flushPromises();
    const slow = deferred<{
      items: PersonalNotification[];
      pageNum: number;
      pageSize: number;
      total: number;
    }>();
    mocks.listMyNotifications
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({
        items: [read],
        total: 1,
        pageNum: 1,
        pageSize: 10,
      });
    wrapper
      .getComponent({ name: 'VxePagerUnitPort' })
      .vm.$emit('current-change', 1);
    await flushPromises();
    const mark = wrapper
      .findAll('button')
      .find((button) => button.text() === '标为已读');
    await requireTestFixture(mark).trigger('click');
    await flushPromises();
    expect(mocks.markMyNotificationRead).toHaveBeenCalledWith(41);
    slow.resolve({ items: [unread], total: 1, pageNum: 1, pageSize: 10 });
    await flushPromises();
    expect(mocks.listMyNotifications).toHaveBeenCalledTimes(3);
    expect(wrapper.text()).toContain('已读');
    expect(wrapper.text()).not.toContain('未读');
    expect(
      wrapper.findAll('button').some((button) => button.text() === '标为已读'),
    ).toBe(false);
    wrapper.unmount();
  });

  it('keeps the last detail and ignores a late previous error', async () => {
    const { wrapper } = await createWrapper();
    await flushPromises();
    const old = deferred<PersonalNotification>();
    mocks.getMyNotification
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({ ...unread, id: 42, body: 'Latest detail' });
    await wrapper.setProps({ notificationId: 41 });
    await flushPromises();
    await wrapper.setProps({ notificationId: 42 });
    await flushPromises();
    old.reject(new Error('slow failure'));
    await flushPromises();
    expect(wrapper.text()).toContain('Latest detail');
    expect(wrapper.text()).not.toContain('通知已失效或无访问权限');
    wrapper.unmount();
  });

  it('closes a header detail on a business page without changing its query', async () => {
    const { wrapper, router } = await createWrapper(
      '?notificationId=777&filter=open',
      '/infra/notice',
    );
    await flushPromises();
    expect(mocks.getMyNotification).not.toHaveBeenCalled();
    await wrapper.setProps({ notificationId: 41 });
    await flushPromises();
    const button = wrapper.findAll('button').find((b) => b.text() === '关闭');
    await requireTestFixture(button).trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe(
      '/infra/notice?notificationId=777&filter=open',
    );
    wrapper.unmount();
  });

  it('paginates the full center and filters unread messages without changing owners', async () => {
    mocks.listMyNotifications.mockResolvedValue({
      items: [unread],
      total: 21,
      pageNum: 1,
      pageSize: 10,
    });
    const { wrapper } = await createWrapper();
    await flushPromises();
    wrapper
      .findComponent({ name: 'VxePagerUnitPort' })
      .vm.$emit('current-change', 2);
    await flushPromises();
    expect(mocks.listMyNotifications).toHaveBeenLastCalledWith({
      pageNum: 2,
      pageSize: 10,
      unreadOnly: undefined,
      orderBy: 'createTime',
      order: 'desc',
    });
    wrapper.unmount();
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
      orderBy: 'createTime',
      order: 'desc',
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
