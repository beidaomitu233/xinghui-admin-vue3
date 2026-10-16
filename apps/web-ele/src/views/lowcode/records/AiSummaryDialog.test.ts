/* eslint-disable vue/one-component-per-file -- Lightweight test component stubs. */
import type { AiRequestView } from '#/api/system/ai-application';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cancelAiRequest,
  getAiRequest,
  submitApplication,
  subscribeAiRequest,
} from '#/api/system/ai-application';

import AiSummaryDialog from './AiSummaryDialog.vue';

vi.mock('#/api/system/ai-application', () => ({
  cancelAiRequest: vi.fn(),
  getAiRequest: vi.fn(),
  submitApplication: vi.fn(),
  subscribeAiRequest: vi.fn(),
}));
vi.mock('element-plus', () => ({
  ElAlert: { name: 'ElAlert', render: () => null },
  ElButton: { name: 'ElButton', render: () => null },
  ElDialog: { name: 'ElDialog', render: () => null },
  ElInput: { name: 'ElInput', render: () => null },
  ElMessage: { success: vi.fn(), warning: vi.fn() },
  ElOption: { name: 'ElOption', render: () => null },
  ElSelect: { name: 'ElSelect', render: () => null },
}));

const Container = defineComponent({
  props: { closable: Boolean, title: { type: String, default: '' } },
  emits: ['close'],
  setup(props, { emit, slots }) {
    return () =>
      h('div', { 'data-message': props.title }, [
        props.title,
        slots.default?.(),
        slots.footer?.(),
        props.closable
          ? h('button', { onClick: () => emit('close') }, '关闭提示')
          : null,
      ]);
  },
});
const Button = defineComponent({
  props: { disabled: Boolean },
  emits: ['click'],
  setup(props, { emit, slots }) {
    return () =>
      h(
        'button',
        { disabled: props.disabled, onClick: () => emit('click') },
        slots.default?.(),
      );
  },
});
const Input = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('textarea', {
        value: props.modelValue,
        onInput: (event: Event) =>
          emit(
            'update:modelValue',
            (event.target as HTMLTextAreaElement).value,
          ),
      });
  },
});
const Select = defineComponent({
  emits: ['update:modelValue'],
  setup(_, { emit, slots }) {
    return () =>
      h(
        'select',
        {
          onChange: (event: Event) =>
            emit(
              'update:modelValue',
              (event.target as HTMLSelectElement).value,
            ),
        },
        slots.default?.(),
      );
  },
});
const Option = defineComponent({
  props: {
    label: { type: String, default: '' },
    value: { type: String, default: '' },
  },
  setup(props) {
    return () => h('option', { value: props.value }, props.label);
  },
});
function accepted(status: AiRequestView['status'] = 'QUEUED'): AiRequestView {
  return {
    appId: '5',
    appVersionId: '11',
    attemptCount: 0,
    businessId: '1:7',
    businessType: 'lowcode.record',
    createdAt: '2026-10-16T08:00:00Z',
    deadline: '2026-10-16T08:01:00Z',
    draftRevision: null,
    errorCode: null,
    finishedAt: null,
    inputTokens: null,
    kind: 'BUSINESS',
    outputStarted: false,
    outputTokens: null,
    requestId: '101',
    stage: 'ACCEPTED',
    status,
    usageKnown: false,
  };
}
function mountDialog(writable = true) {
  return mount(AiSummaryDialog, {
    props: {
      appId: '5',
      fields: [
        {
          defaultValue: null,
          fieldKey: 'summary',
          help: '',
          label: '摘要',
          listVisible: true,
          max: null,
          maxLength: 200,
          min: null,
          options: [],
          required: false,
          searchable: false,
          type: 'textarea',
        },
      ],
      formId: '1',
      modelValue: true,
      recordId: '7',
      writable,
    },
    global: {
      stubs: {
        ElAlert: Container,
        ElButton: Button,
        ElDialog: Container,
        ElInput: Input,
        ElOption: Option,
        ElSelect: Select,
      },
    },
  });
}
function button(wrapper: ReturnType<typeof mountDialog>, label: string) {
  const result = wrapper
    .findAll('button')
    .find((item) => item.text() === label);
  if (!result) throw new Error(`Missing button ${label}`);
  return result;
}

describe('record summary interaction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    sessionStorage.clear();
    vi.mocked(submitApplication).mockResolvedValue(accepted());
    vi.mocked(getAiRequest).mockResolvedValue(accepted('RUNNING'));
    vi.mocked(cancelAiRequest).mockResolvedValue(accepted('CANCELLED'));
  });

  it('ignores late deltas and completion callbacks after confirmed local cancellation', async () => {
    let receive: Parameters<typeof subscribeAiRequest>[1] | undefined;
    let finish: (() => void) | undefined;
    vi.mocked(subscribeAiRequest).mockImplementation(async (_id, callback) => {
      receive = callback;
      callback({
        requestId: '101',
        sequence: 1,
        text: 'visible partial',
        type: 'delta',
      });
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const wrapper = mountDialog();
    await button(wrapper, '生成摘要').trigger('click');
    await flushPromises();
    await button(wrapper, '取消生成').trigger('click');
    await flushPromises();
    receive?.({
      requestId: '101',
      sequence: 2,
      text: 'must not append',
      type: 'delta',
    });
    receive?.({
      requestId: '101',
      sequence: 3,
      status: 'SUCCEEDED',
      type: 'completed',
    });
    finish?.();
    await flushPromises();
    expect(
      (
        wrapper.get('textarea[aria-label="摘要结果"]')
          .element as HTMLTextAreaElement
      ).value,
    ).toBe('visible partial');
    expect(wrapper.text()).toContain('已取消');
    expect(wrapper.find('select').exists()).toBe(false);
    expect(cancelAiRequest).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('shows a known admission failure and its original trace without silently resubmitting', async () => {
    vi.mocked(submitApplication).mockRejectedValueOnce({
      response: {
        headers: { 'x-request-id': '101' },
        data: { message: 'RESOURCE_FORBIDDEN' },
      },
    });
    vi.mocked(getAiRequest).mockResolvedValue({
      ...accepted('FAILED'),
      errorCode: 'RESOURCE_FORBIDDEN',
    });
    const wrapper = mountDialog();
    await button(wrapper, '生成摘要').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('无权读取所需记录。');
    expect(wrapper.text()).toContain('101');
    expect(getAiRequest).toHaveBeenCalledWith('101');
    expect(sessionStorage.getItem('ai-summary:5:1:7')).toBe('101');
    expect(submitApplication).toHaveBeenCalledOnce();
    expect(subscribeAiRequest).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('restores only request metadata on reload without submitting or pretending to recover output', async () => {
    sessionStorage.setItem('ai-summary:5:1:7', '101');
    vi.mocked(getAiRequest).mockResolvedValue(accepted('SUCCEEDED'));
    const wrapper = mountDialog();
    await flushPromises();
    expect(getAiRequest).toHaveBeenCalledWith('101');
    expect(submitApplication).not.toHaveBeenCalled();
    expect(subscribeAiRequest).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('历史正文未保留');
    expect(wrapper.emitted('adopt')).toBeUndefined();
    wrapper.unmount();
  });

  it('reuses admission identity after an ambiguous network failure and never submits record contents', async () => {
    vi.mocked(submitApplication)
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce(accepted('SUCCEEDED'));
    const wrapper = mountDialog();
    await button(wrapper, '生成摘要').trigger('click');
    await flushPromises();
    await button(wrapper, '确认原受理结果').trigger('click');
    await flushPromises();
    expect(submitApplication).toHaveBeenCalledTimes(2);
    expect(vi.mocked(submitApplication).mock.calls[0]?.[1]).toEqual(
      vi.mocked(submitApplication).mock.calls[1]?.[1],
    );
    expect(vi.mocked(submitApplication).mock.calls[0]?.[1].businessRef).toEqual(
      { id: '1:7', type: 'lowcode.record' },
    );
    expect(
      Object.keys(vi.mocked(submitApplication).mock.calls[0]?.[1].inputs ?? {}),
    ).toEqual(['user_request']);
    expect(subscribeAiRequest).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps partial output and queries the original run after disconnect without a second submission', async () => {
    vi.mocked(subscribeAiRequest).mockImplementation(async (_id, receive) => {
      receive({
        requestId: '101',
        sequence: 1,
        text: 'partial summary',
        type: 'delta',
      });
      throw new Error('stream lost');
    });
    const wrapper = mountDialog();
    await button(wrapper, '生成摘要').trigger('click');
    await flushPromises();
    expect(submitApplication).toHaveBeenCalledOnce();
    expect(getAiRequest).toHaveBeenCalledWith('101');
    expect(wrapper.text()).toContain('连接中断，请查询原请求。');
    const warning = wrapper
      .findAll('[data-message]')
      .find(
        (element) =>
          element.attributes('data-message') === '连接中断，请查询原请求。',
      );
    expect(warning).toBeDefined();
    await warning?.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain('连接中断，请查询原请求。');
    expect(wrapper.find('select').exists()).toBe(false);
    expect(wrapper.emitted('adopt')).toBeUndefined();
    wrapper.unmount();
  });

  it('only explicit successful adoption emits an editor draft and never saves a record', async () => {
    vi.mocked(subscribeAiRequest).mockImplementation(async (_id, receive) => {
      receive({
        requestId: '101',
        sequence: 1,
        text: 'authorized summary',
        type: 'delta',
      });
      receive({
        requestId: '101',
        sequence: 2,
        status: 'SUCCEEDED',
        type: 'completed',
      });
    });
    const wrapper = mountDialog();
    await button(wrapper, '生成摘要').trigger('click');
    await flushPromises();
    expect(wrapper.emitted('adopt')).toBeUndefined();
    await wrapper.get('select').setValue('summary');
    await button(wrapper, '填入编辑草稿').trigger('click');
    expect(wrapper.emitted('adopt')).toEqual([
      ['summary', 'authorized summary'],
    ]);
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
    expect(submitApplication).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('cancels an accepted run if the component was removed before admission returned', async () => {
    let resolve: ((value: AiRequestView) => void) | undefined;
    vi.mocked(submitApplication).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const wrapper = mountDialog();
    await button(wrapper, '生成摘要').trigger('click');
    wrapper.unmount();
    resolve?.(accepted());
    await flushPromises();
    expect(cancelAiRequest).toHaveBeenCalledWith('101');
    expect(subscribeAiRequest).not.toHaveBeenCalled();
  });
});
