import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { ElButton } from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addJob,
  getJobHandlers,
  getJobList,
  updateJob,
} from '#/api/monitor/job';
import { getDictOptions } from '#/api/system/dict';
import { requireTestFixture } from '#/test-utils/required-fixture';

import JobPage from './index.vue';

vi.mock('@vben/common-ui', () => ({
  Page: { template: '<div><slot /></div>' },
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({
    accessCodes: [
      'monitor:job:add',
      'monitor:job:edit',
      'monitor:job:remove',
      'monitor:job:run',
      'monitor:job:query',
      'monitor:job:changeStatus',
    ],
  }),
}));
vi.mock('#/api/monitor/job', () => ({
  addJob: vi.fn(),
  changeJobStatus: vi.fn(),
  getJob: vi.fn(),
  getJobFires: vi.fn(),
  getJobHandlers: vi.fn().mockResolvedValue(['system.noop']),
  getJobList: vi.fn(),
  removeJob: vi.fn(),
  runJob: vi.fn(),
  updateJob: vi.fn(),
}));
vi.mock('#/api/system/dict', () => ({
  getDictOptions: vi.fn(),
  getDictLabel: vi.fn(),
}));

const Container = defineComponent({
  props: { title: { type: String, default: '' } },
  setup(props, { slots }) {
    return () => h('div', [props.title, slots.header?.(), slots.default?.()]);
  },
});

describe('job page with controlled handlers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getJobHandlers).mockResolvedValue(['system.noop']);
  });

  it('offers controlled task creation without a legacy invokeTarget field', async () => {
    vi.mocked(getDictOptions).mockResolvedValue([
      { value: '0', label: '启用配置', sortOrder: 10 },
      { value: '1', label: '暂停', sortOrder: 20 },
    ]);
    vi.mocked(getJobList).mockResolvedValue({ records: [], total: 0 });
    const wrapper = mount(JobPage, {
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
          ElRadio: Container,
          ElRadioGroup: Container,
          ElSelect: Container,
          ElTable: Container,
          ElTableColumn: { template: '<div />' },
          ElTag: Container,
        },
        directives: { loading: () => {} },
      },
    });
    await flushPromises();

    expect(getJobList).toHaveBeenCalledTimes(1);
    expect(getDictOptions).toHaveBeenCalledWith('job_status');
    const add = wrapper
      .findAll('button')
      .find((button) => button.text().includes('新增任务'));
    expect(add).toBeDefined();
    expect(add?.attributes('disabled')).toBeUndefined();
    await requireTestFixture(add).trigger('click');
    await flushPromises();
    expect(getJobHandlers).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).not.toContain('invokeTarget');
    expect(addJob).not.toHaveBeenCalled();
    expect(updateJob).not.toHaveBeenCalled();
  });

  it('reloads current rows after the status dictionary recovers', async () => {
    vi.mocked(getDictOptions)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([{ value: '1', label: '暂停', sortOrder: 20 }]);
    vi.mocked(getJobList).mockResolvedValue({
      records: [{ jobId: '1', status: '1' } as never],
      total: 1,
    });
    const wrapper = mount(JobPage, {
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
          ElRadio: Container,
          ElRadioGroup: Container,
          ElSelect: Container,
          ElTable: Container,
          ElTableColumn: { template: '<div />' },
          ElTag: Container,
        },
        directives: { loading: () => {} },
      },
    });
    await flushPromises();
    expect(getJobList).toHaveBeenCalledTimes(1);
    const retry = wrapper
      .findAll('button')
      .find((button) => button.text().includes('重新加载'));
    expect(retry).toBeDefined();
    await requireTestFixture(retry).trigger('click');
    await flushPromises();
    expect(getDictOptions).toHaveBeenCalledTimes(2);
    expect(getJobList).toHaveBeenCalledTimes(2);
  });
});
