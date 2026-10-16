import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { ElButton } from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getJobLog, getJobLogList } from '#/api/monitor/jobLog';
import { requireTestFixture } from '#/test-utils/required-fixture';

import LogPage from './index.vue';

vi.mock('@vben/common-ui', () => ({
  Page: { template: '<div><slot /></div>' },
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({
    accessCodes: [
      'monitor:jobLog:list',
      'monitor:jobLog:query',
      'monitor:jobLog:clean',
      'monitor:jobLog:remove',
    ],
  }),
}));
vi.mock('#/api/monitor/jobLog', () => ({
  getJobLogList: vi.fn(),
  getJobLog: vi.fn(),
  removeJobLog: vi.fn(),
  cleanJobLog: vi.fn(),
}));

const Container = defineComponent({
  setup(_, { slots }) {
    return () => h('div', [slots.header?.(), slots.default?.()]);
  },
});

describe('new scheduler execution log page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getJobLogList).mockResolvedValue({
      records: [],
      total: 0,
      pageNum: 1,
      pageSize: 10,
    });
  });

  it('loads the safe fire ledger and exposes retention actions without legacy fields', async () => {
    const wrapper = mount(LogPage, {
      global: {
        stubs: {
          ElAlert: Container,
          ElButton,
          ElCard: Container,
          ElDialog: Container,
          ElForm: Container,
          ElFormItem: Container,
          ElInput: Container,
          ElOption: Container,
          ElPagination: Container,
          ElSelect: Container,
          ElTable: Container,
          ElTableColumn: { template: '<div />' },
          ElTag: Container,
          ElDescriptions: Container,
          ElDescriptionsItem: Container,
        },
        directives: { loading: () => {} },
      },
    });
    await flushPromises();
    expect(getJobLogList).toHaveBeenCalledWith(
      expect.objectContaining({ pageNum: 1, pageSize: 10 }),
    );
    expect(wrapper.text()).toContain('清理到期记录');
    expect(wrapper.text()).not.toContain('调用目标');
    expect(wrapper.text()).not.toContain('异常信息');
    expect(getJobLog).not.toHaveBeenCalled();
  });

  it('shows a retry action when the ledger request fails', async () => {
    vi.mocked(getJobLogList).mockRejectedValueOnce(new Error('offline'));
    const wrapper = mount(LogPage, {
      global: {
        stubs: {
          ElAlert: Container,
          ElButton,
          ElCard: Container,
          ElDialog: Container,
          ElForm: Container,
          ElFormItem: Container,
          ElInput: Container,
          ElOption: Container,
          ElPagination: Container,
          ElSelect: Container,
          ElTable: Container,
          ElTableColumn: { template: '<div />' },
          ElTag: Container,
          ElDescriptions: Container,
          ElDescriptionsItem: Container,
        },
        directives: { loading: () => {} },
      },
    });
    await flushPromises();
    const retry = wrapper
      .findAll('button')
      .find((button) => button.text().includes('重试'));
    expect(retry).toBeDefined();
    await requireTestFixture(retry).trigger('click');
    await flushPromises();
    expect(getJobLogList).toHaveBeenCalledTimes(2);
  });
});
