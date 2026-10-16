import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { ElButton, ElInput } from 'element-plus';
import { describe, expect, it, vi } from 'vitest';

import { getOperLogList } from '#/api/monitor/operlog';

import OperLogPage from './index.vue';

vi.mock('@vben/access', () => ({
  useAccess: () => ({
    hasAccessByCodes: (codes: string[]) => codes[0] !== 'monitor:operlog:clean',
  }),
}));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<div><slot /></div>' },
}));
vi.mock('#/api/monitor/operlog', () => ({
  getOperLogList: vi.fn(),
  removeOperLog: vi.fn(),
  cleanOperLog: vi.fn(),
}));

const Container = defineComponent({
  setup(_, { slots }) {
    return () => h('div', [slots.header?.(), slots.default?.()]);
  },
});
const Pagination = defineComponent({
  props: { total: { type: Number, default: 0 } },
  setup(props) {
    return () => h('output', { 'data-testid': 'total' }, String(props.total));
  },
});

describe('operlog page search wiring', () => {
  it('passes the entered title to the API and renders the filtered total, then resets', async () => {
    vi.mocked(getOperLogList)
      .mockResolvedValueOnce({ records: [], total: 11 })
      .mockResolvedValueOnce({ records: [], total: 4 })
      .mockResolvedValueOnce({ records: [], total: 11 });

    const wrapper = mount(OperLogPage, {
      global: {
        stubs: {
          ElAlert: Container,
          ElButton,
          ElCard: Container,
          ElDialog: Container,
          ElDescriptions: Container,
          ElDescriptionsItem: Container,
          ElEmpty: Container,
          ElForm: Container,
          ElFormItem: Container,
          ElInput,
          ElOption: Container,
          ElPagination: Pagination,
          ElSelect: Container,
          ElTag: Container,
          ElTable: Container,
          ElTableColumn: { template: '<div />' },
        },
        directives: { loading: () => {} },
      },
    });
    await flushPromises();
    expect(getOperLogList).toHaveBeenCalledTimes(1);
    expect(
      wrapper.findAll('button').some((button) => button.text() === '清空'),
    ).toBe(false);

    // Element Plus may emit update:modelValue after a very fast click.
    // The search must use the text the user can already see in the input.
    const titleInput = wrapper.get('input[placeholder="请输入系统模块"]');
    (titleInput.element as HTMLInputElement).value = '文件上传';
    const searchButton = wrapper
      .findAll('button')
      .find((button) => button.text() === '搜索');
    if (!searchButton) throw new Error('搜索按钮缺失');
    await searchButton.trigger('click');
    await flushPromises();
    expect(getOperLogList).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: '文件上传' }),
    );
    expect(wrapper.get('[data-testid="total"]').text()).toBe('4');

    const resetButton = wrapper
      .findAll('button')
      .find((button) => button.text() === '重置');
    if (!resetButton) throw new Error('重置按钮缺失');
    await resetButton.trigger('click');
    await flushPromises();
    expect(getOperLogList).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: '' }),
    );
    expect(wrapper.get('[data-testid="total"]').text()).toBe('11');
    expect((titleInput.element as HTMLInputElement).value).toBe('');
  });
});
