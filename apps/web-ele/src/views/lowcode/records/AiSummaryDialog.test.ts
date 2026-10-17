/* eslint-disable vue/one-component-per-file -- Lightweight test component stubs. */
import type { SceneRequest } from '#/api/system/ai-scene';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { subscribeAiRequest } from '#/api/system/ai-application';
import { getConversation } from '#/api/system/ai-conversation';
import {
  cancelSceneRequest,
  getSceneRequest,
  submitScene,
} from '#/api/system/ai-scene';

import AiSummaryDialog from './AiSummaryDialog.vue';

vi.mock('#/api/system/ai-scene', () => ({
  cancelSceneRequest: vi.fn(),
  getSceneRequest: vi.fn(),
  submitScene: vi.fn(),
}));
vi.mock('#/api/system/ai-application', () => ({ subscribeAiRequest: vi.fn() }));
vi.mock('#/api/system/ai-conversation', () => ({ getConversation: vi.fn() }));
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
function accepted(status: SceneRequest['status'] = 'QUEUED'): SceneRequest {
  return {
    sceneKey: '5',
    sceneVersionId: '11',
    attemptCount: 0,
    businessRef: { id: '1:7', type: 'lowcode.record' },
    createdAt: '2026-10-16T08:00:00Z',
    deadline: '2026-10-16T08:01:00Z',
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
      sceneKey: '5',
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
    vi.mocked(submitScene).mockResolvedValue(accepted());
    vi.mocked(getSceneRequest).mockResolvedValue(accepted('RUNNING'));
    vi.mocked(cancelSceneRequest).mockResolvedValue(accepted('CANCELLED'));
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
    expect(wrapper.text()).toContain('场景版本：11');
    expect(wrapper.text()).not.toContain('应用版本');
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
    expect(cancelSceneRequest).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('shows a known admission failure and its original trace without silently resubmitting', async () => {
    vi.mocked(submitScene).mockRejectedValueOnce({
      response: {
        headers: { 'x-request-id': '101' },
        data: { message: 'RESOURCE_FORBIDDEN' },
      },
    });
    vi.mocked(getSceneRequest).mockResolvedValue({
      ...accepted('FAILED'),
      errorCode: 'RESOURCE_FORBIDDEN',
    });
    const wrapper = mountDialog();
    await button(wrapper, '生成摘要').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('无权读取所需记录。');
    expect(wrapper.text()).toContain('101');
    expect(getSceneRequest).toHaveBeenCalledWith('101');
    expect(sessionStorage.getItem('ai-scene-summary:5:1:7')).toBe('101');
    expect(submitScene).toHaveBeenCalledOnce();
    expect(subscribeAiRequest).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('restores only request metadata on reload without submitting or pretending to recover output', async () => {
    sessionStorage.setItem('ai-scene-summary:5:1:7', '101');
    vi.mocked(getSceneRequest).mockResolvedValue(accepted('SUCCEEDED'));
    const wrapper = mountDialog();
    await flushPromises();
    expect(getSceneRequest).toHaveBeenCalledWith('101');
    expect(submitScene).not.toHaveBeenCalled();
    expect(subscribeAiRequest).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('旧记录未保留对话');
    expect(wrapper.emitted('adopt')).toBeUndefined();
    wrapper.unmount();
  });

  it('restores persisted successful text without adopting or writing, and opens the same conversation', async () => {
    sessionStorage.setItem('ai-scene-summary:5:1:7', '101');
    vi.mocked(getSceneRequest).mockResolvedValue({
      ...accepted('SUCCEEDED'),
      conversationId: 'conv-1',
    });
    vi.mocked(getConversation).mockResolvedValue({
      conversation: {
        conversationId: 'conv-1',
        sceneKey: '5',
        title: '摘要讨论',
        sceneName: '摘要',
        kind: 'BUSINESS',
        businessRef: { type: 'lowcode.record', id: '1:7' },
        sourceLabel: '记录',
        revision: 2,
        status: 'SUCCEEDED',
        lastMessage: '数据库保存的摘要',
        updatedAt: '2026-10-18T00:00:00Z',
        history: 'COMPLETE',
        canContinue: true,
      },
      messages: [
        {
          messageId: 'a1',
          sequence: 2,
          role: 'ASSISTANT',
          content: '数据库保存的摘要',
          status: 'SUCCEEDED',
          requestId: '101',
          sceneVersionId: '11',
          errorCode: null,
          partial: false,
          createdAt: '2026-10-18T00:00:00Z',
          finishedAt: '2026-10-18T00:00:00Z',
        },
      ],
      notice: null,
    });
    const wrapper = mountDialog();
    await flushPromises();
    expect(
      (
        wrapper.get('textarea[aria-label="摘要结果"]')
          .element as HTMLTextAreaElement
      ).value,
    ).toBe('数据库保存的摘要');
    expect(wrapper.emitted('adopt')).toBeUndefined();
    expect(submitScene).not.toHaveBeenCalled();
    await button(wrapper, '查看完整对话并追问').trigger('click');
    expect(wrapper.emitted('conversation')).toEqual([['conv-1']]);
    wrapper.unmount();
  });

  it('reuses admission identity after an ambiguous network failure and never submits record contents', async () => {
    vi.mocked(submitScene)
      .mockRejectedValueOnce(new Error('connection lost'))
      .mockResolvedValueOnce(accepted('SUCCEEDED'));
    const wrapper = mountDialog();
    await button(wrapper, '生成摘要').trigger('click');
    await flushPromises();
    await button(wrapper, '确认原受理结果').trigger('click');
    await flushPromises();
    expect(submitScene).toHaveBeenCalledTimes(2);
    expect(vi.mocked(submitScene).mock.calls[0]?.[1]).toEqual(
      vi.mocked(submitScene).mock.calls[1]?.[1],
    );
    expect(vi.mocked(submitScene).mock.calls[0]?.[1].businessRef).toEqual({
      id: '1:7',
      type: 'lowcode.record',
    });
    expect(
      Object.keys(vi.mocked(submitScene).mock.calls[0]?.[1].inputs ?? {}),
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
    expect(submitScene).toHaveBeenCalledOnce();
    expect(getSceneRequest).toHaveBeenCalledWith('101');
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
    expect(submitScene).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('cancels an accepted run if the component was removed before admission returned', async () => {
    let resolve: ((value: SceneRequest) => void) | undefined;
    vi.mocked(submitScene).mockImplementation(
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
    expect(cancelSceneRequest).toHaveBeenCalledWith('101');
    expect(subscribeAiRequest).not.toHaveBeenCalled();
  });
});
