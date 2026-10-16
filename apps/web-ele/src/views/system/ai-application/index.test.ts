/* eslint-disable vue/one-component-per-file -- Test-local UI components. */
import type {
  AiRequestView,
  ApplicationView,
} from '#/api/system/ai-application';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { ElMessageBox } from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '#/api/system/ai-application';

import ApplicationCenter from './index.vue';

vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({
    accessCodes: ['list', 'query', 'add', 'edit', 'test', 'publish'].map(
      (action) => `ai:application:${action}`,
    ),
  }),
}));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<div><slot /></div>' },
}));
vi.mock('#/api/system/ai-application', () =>
  Object.fromEntries(
    [
      'applicationModels',
      'applicationHealth',
      'applicationTemplateOptions',
      'applicationTestEvidence',
      'cancelAiRequest',
      'createApplication',
      'getAiRequest',
      'getApplication',
      'listApplications',
      'listApplicationVersions',
      'previewApplication',
      'publishApplication',
      'rollbackApplication',
      'setApplicationEnabled',
      'submitApplicationTest',
      'subscribeAiRequest',
      'updateApplicationDraft',
    ].map((name) => [name, vi.fn()]),
  ),
);
vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
  ElLoadingDirective: { mounted: () => {}, updated: () => {} },
  ...Object.fromEntries(
    [
      'ElAlert',
      'ElButton',
      'ElCard',
      'ElCheckbox',
      'ElDialog',
      'ElForm',
      'ElFormItem',
      'ElInput',
      'ElInputNumber',
      'ElOption',
      'ElPagination',
      'ElSelect',
      'ElSwitch',
      'ElTable',
      'ElTableColumn',
    ].map((name) => [name, { name, render: () => null }]),
  ),
}));

let app: ApplicationView;
const Box = defineComponent({
  props: {
    label: { type: String, default: '' },
    title: { type: String, default: '' },
  },
  setup(props, { slots }) {
    return () =>
      h('section', { 'data-label': props.label }, [
        props.title,
        slots.default?.(),
        slots.footer?.(),
      ]);
  },
});
const Dialog = defineComponent({
  props: { modelValue: Boolean },
  setup(props, { slots }) {
    return () =>
      props.modelValue
        ? h('aside', [slots.default?.(), slots.footer?.()])
        : null;
  },
});
const Column = defineComponent({
  setup(_, { slots }) {
    return () => h('div', slots.default?.({ row: app }));
  },
});
const Button = defineComponent({
  props: { disabled: Boolean, loading: Boolean },
  emits: ['click'],
  setup(props, { slots, emit }) {
    return () =>
      h(
        'button',
        {
          disabled: props.disabled || props.loading,
          onClick: () => emit('click'),
        },
        slots.default?.(),
      );
  },
});
const Input = defineComponent({
  props: {
    modelValue: { type: [String, Number], default: '' },
    disabled: Boolean,
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('textarea', {
        value: props.modelValue,
        disabled: props.disabled,
        onInput: (event: Event) =>
          emit(
            'update:modelValue',
            (event.target as HTMLTextAreaElement).value,
          ),
      });
  },
});
const Select = defineComponent({
  props: { disabled: Boolean },
  emits: ['change'],
  setup(props, { slots }) {
    return () =>
      h('div', { 'data-disabled': props.disabled }, slots.default?.());
  },
});
function render() {
  return mount(ApplicationCenter, {
    global: {
      directives: { loading: () => {} },
      stubs: {
        Page: Box,
        ElCard: Box,
        ElAlert: Box,
        ElForm: Box,
        ElFormItem: Box,
        ElDialog: Dialog,
        ElTable: Box,
        ElTableColumn: Column,
        ElButton: Button,
        ElInput: Input,
        ElInputNumber: Input,
        ElSelect: Select,
        ElOption: Box,
        ElCheckbox: Box,
        ElPagination: Box,
        KeyPolicyEditor: true,
        RequestLogPanel: true,
      },
    },
  });
}
type View = ReturnType<typeof render>;
function button(view: View, label: string) {
  const result = view.findAll('button').find((item) => item.text() === label);
  if (!result) throw new Error(`Missing ${label}`);
  return result;
}
async function open(view: View) {
  await flushPromises();
  await button(view, '配置 / 测试').trigger('click');
  await flushPromises();
}
async function sample(view: View) {
  await view.get('[data-label="有权查看的记录 ID"] textarea').setValue('8');
}
beforeEach(() => {
  vi.clearAllMocks();
  app = {
    appId: '1',
    name: 'Summary',
    purpose: 'Record summary',
    ownerId: '101',
    entryKey: 'lowcode.record.summary/7',
    draftRevision: 3,
    revision: 5,
    enabled: true,
    publishedVersionId: '20',
    draft: {
      modelMode: 'ROUND_ROBIN',
      models: ['31', '32'].map((modelRef) => ({
        model: { modelRef, configVersion: '40' },
        keyMode: 'AUTO',
        allowedKeys: [],
        fixedKey: null,
        fallbackKeys: [],
      })),
      modelFallback: true,
      template: { templateId: '11', templateVersionId: '12' },
      inputNames: ['user_request'],
      requirements: { outputFormat: 'TEXT', streaming: true, tools: false },
      scope: 'FRONTEND',
      allowedSubjects: ['101'],
      allowedAuthorities: [],
      formId: '7',
      timeoutSeconds: 30,
      maxAttempts: 2,
      maxConcurrent: 2,
      maxTokens: 100,
    },
  };
  vi.mocked(api.listApplications).mockResolvedValue({
    records: [app],
    total: 1,
    pageNum: 1,
    pageSize: 20,
  });
  vi.mocked(api.getApplication).mockImplementation(async () =>
    structuredClone(app),
  );
  vi.mocked(api.applicationModels).mockResolvedValue([]);
  vi.mocked(api.applicationTemplateOptions).mockResolvedValue({
    records: [],
    total: 0,
    pageNum: 1,
    pageSize: 100,
  });
  vi.mocked(api.applicationTestEvidence).mockResolvedValue([]);
  vi.mocked(ElMessageBox.confirm).mockResolvedValue(
    Object.assign('confirm' as const, {
      action: 'confirm' as const,
      value: '',
    }),
  );
});

describe('application configuration and explicit model testing', () => {
  it('creates an ordinary application with a stable configurable entry and no form binding', async () => {
    vi.mocked(api.createApplication).mockImplementation(async (draft) => {
      app = {
        ...app,
        name: draft.name,
        purpose: draft.purpose,
        entryKey: draft.entryKey,
        draft: draft.policy,
      };
      return app.appId;
    });
    const view = render();
    await flushPromises();
    await button(view, '新建应用').trigger('click');
    await flushPromises();
    expect(view.find('[data-label="目标表单 ID"]').exists()).toBe(false);
    await view.get('aside [data-label="名称"] textarea').setValue('Rewrite');
    await view
      .get('[data-label="用途"] textarea')
      .setValue('Rewrite supplied text');
    const entry = view.get('[data-label="稳定入口标识"] textarea');
    await entry.setValue('lowcode.record.summary/7');
    await button(view, '保存草稿').trigger('click');
    await flushPromises();
    expect(api.createApplication).not.toHaveBeenCalled();
    await entry.setValue('business.rewrite');
    await button(view, '保存草稿').trigger('click');
    await flushPromises();
    expect(api.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        entryKey: 'business.rewrite',
        policy: expect.objectContaining({ formId: null }),
      }),
    );
    expect(
      view.get('[data-label="稳定入口标识"] textarea').attributes('disabled'),
    ).toBeDefined();
    expect(
      view
        .get('[data-label="入口类型"]')
        .getComponent(Select)
        .props('disabled'),
    ).toBe(true);
    expect(view.find('[data-label="目标表单 ID"]').exists()).toBe(false);
    view.unmount();
  });

  it('uses generic sample references for bound preview and explicit testing without an actor field', async () => {
    app.entryKey = 'business.rewrite';
    app.draft.formId = null;
    app.draft.models = app.draft.models.slice(0, 1);
    vi.mocked(api.previewApplication).mockResolvedValue({
      version: { templateId: '11', templateVersionId: '12' },
      originalMessages: [],
      renderedMessages: [],
      inputSummary: {},
      resourceSummary: {},
      notices: [],
    });
    vi.mocked(api.submitApplicationTest).mockResolvedValue({
      requestId: '101',
      status: 'QUEUED',
    } as AiRequestView);
    vi.mocked(api.subscribeAiRequest).mockImplementation(async (id, event) => {
      event({
        type: 'completed',
        sequence: 1,
        requestId: id,
        status: 'SUCCEEDED',
      });
    });
    const view = render();
    await open(view);
    await view
      .get('[data-label="业务类型"] textarea')
      .setValue('business.rewrite');
    await view
      .get('[data-label="业务关联 ID"] textarea')
      .setValue('page-ABC:17');
    await button(view, '脱敏预览').trigger('click');
    await flushPromises();
    const input = {
      businessRef: { type: 'business.rewrite', id: 'page-ABC:17' },
      inputs: { user_request: '请概括记录的主要信息。' },
    };
    expect(api.previewApplication).toHaveBeenCalledWith('1', 5, input);
    await button(view, '依次测试全部候选').trigger('click');
    await flushPromises();
    expect(api.submitApplicationTest).toHaveBeenCalledWith('1', 5, 0, {
      ...input,
      idempotencyKey: expect.any(String),
    });
    expect(api.submitApplicationTest).toHaveBeenCalledTimes(1);
    expect(view.find('[data-label="有权查看的记录 ID"]').exists()).toBe(false);
    view.unmount();
  });

  it('creates explicit summaries with the reserved entry and actual form binding', async () => {
    vi.mocked(api.createApplication).mockImplementation(async (draft) => {
      app = {
        ...app,
        name: draft.name,
        purpose: draft.purpose,
        entryKey: draft.entryKey,
        draft: draft.policy,
      };
      return app.appId;
    });
    const view = render();
    await flushPromises();
    await button(view, '新建应用').trigger('click');
    await flushPromises();
    view
      .get('[data-label="入口类型"]')
      .getComponent(Select)
      .vm.$emit('change', 'SUMMARY');
    await flushPromises();
    await view.get('aside [data-label="名称"] textarea').setValue('Summary');
    await view.get('[data-label="用途"] textarea').setValue('Record summary');
    await view.get('[data-label="目标表单 ID"] textarea').setValue('7');
    await button(view, '保存草稿').trigger('click');
    await flushPromises();
    expect(api.createApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        entryKey: 'lowcode.record.summary/7',
        policy: expect.objectContaining({ formId: '7' }),
      }),
    );
    expect(
      view.get('[data-label="目标表单 ID"] textarea').attributes('disabled'),
    ).toBeDefined();
    view.unmount();
  });
  it('confirms uncertain admission with the original frozen nonce and sample instead of a new test', async () => {
    vi.mocked(api.submitApplicationTest)
      .mockRejectedValueOnce(new Error('lost admission response'))
      .mockResolvedValueOnce({
        requestId: '101',
        status: 'SUCCEEDED',
      } as AiRequestView);
    const view = render();
    await open(view);
    await sample(view);
    await button(view, '依次测试全部候选').trigger('click');
    await flushPromises();
    const original = vi.mocked(api.submitApplicationTest).mock.calls[0];
    await sample(view);
    await button(view, '依次测试全部候选').trigger('click');
    await flushPromises();
    expect(api.submitApplicationTest).toHaveBeenCalledTimes(1);
    await button(view, '确认原测试受理').trigger('click');
    await flushPromises();
    expect(vi.mocked(api.submitApplicationTest).mock.calls[1]).toEqual(
      original,
    );
    expect(api.subscribeAiRequest).not.toHaveBeenCalled();
    view.unmount();
  });
  it('keeps edited draft and original online version when save fails', async () => {
    vi.mocked(api.updateApplicationDraft).mockRejectedValue(
      new Error('untrusted raw body'),
    );
    const view = render();
    await open(view);
    await view
      .get('aside [data-label="名称"] textarea')
      .setValue('Unsaved name');
    await button(view, '保存草稿').trigger('click');
    await flushPromises();
    expect(
      view.get('aside [data-label="名称"] textarea').element,
    ).toHaveProperty('value', 'Unsaved name');
    expect(view.text()).toContain('发布 20');
    expect(view.text()).not.toContain('untrusted raw body');
    expect(api.publishApplication).not.toHaveBeenCalled();
    expect(api.updateApplicationDraft).toHaveBeenCalledWith(
      '1',
      5,
      expect.objectContaining({ name: 'Unsaved name' }),
    );
    view.unmount();
  });

  it('previews the saved bound draft without model calls or client actor/template override', async () => {
    vi.mocked(api.previewApplication).mockResolvedValue({
      version: { templateId: '11', templateVersionId: '12' },
      originalMessages: [],
      renderedMessages: [{ role: 'USER', content: '[MASKED]' }],
      inputSummary: {},
      resourceSummary: {},
      notices: [],
    });
    const view = render();
    await open(view);
    await sample(view);
    await button(view, '脱敏预览').trigger('click');
    await flushPromises();
    expect(api.previewApplication).toHaveBeenCalledWith('1', 5, {
      businessRef: { type: 'lowcode.record', id: '7:8' },
      inputs: { user_request: '请概括记录的主要信息。' },
    });
    expect(view.text()).toContain('[MASKED]');
    expect(api.submitApplicationTest).not.toHaveBeenCalled();
    expect(button(view, '发布当前版本').attributes('disabled')).toBeDefined();
    view.unmount();
  });

  it('saves explicit candidate order and requires current successful evidence for publication', async () => {
    const view = render();
    await open(view);
    const move = view.findAll('button').find((item) => item.text() === '下移');
    if (!move) throw new Error('Missing move');
    await move.trigger('click');
    vi.mocked(api.updateApplicationDraft).mockImplementation(
      async (_id, _revision, draft) => ({
        ...app,
        draft: draft.policy,
        revision: 6,
        draftRevision: 4,
      }),
    );
    await button(view, '保存草稿').trigger('click');
    await flushPromises();
    const call = vi.mocked(api.updateApplicationDraft).mock.calls[0];
    expect(
      call?.[2].policy.models.map((binding) => binding.model.modelRef),
    ).toEqual(['32', '31']);
    expect(button(view, '发布当前版本').attributes('disabled')).toBeDefined();
    expect(api.submitApplicationTest).not.toHaveBeenCalled();
    view.unmount();
  });

  it('confirms budget before calling a candidate and stops after an unresolved interrupted stream', async () => {
    vi.mocked(api.submitApplicationTest).mockResolvedValue({
      requestId: '101',
      status: 'QUEUED',
    } as AiRequestView);
    vi.mocked(api.subscribeAiRequest).mockRejectedValue(new Error('network'));
    vi.mocked(api.getAiRequest).mockResolvedValue({
      requestId: '101',
      status: 'RUNNING',
    } as AiRequestView);
    const view = render();
    await open(view);
    await sample(view);
    await button(view, '依次测试全部候选').trigger('click');
    await flushPromises();
    expect(ElMessageBox.confirm).toHaveBeenCalledWith(
      expect.stringContaining('最多 4 次模型尝试'),
      '测试当前草稿',
    );
    expect(api.submitApplicationTest).toHaveBeenCalledTimes(1);
    expect(api.submitApplicationTest).toHaveBeenCalledWith(
      '1',
      5,
      0,
      expect.objectContaining({
        businessRef: { type: 'lowcode.record', id: '7:8' },
        idempotencyKey: expect.any(String),
      }),
    );
    await button(view, '依次测试全部候选').trigger('click');
    await flushPromises();
    expect(api.submitApplicationTest).toHaveBeenCalledTimes(1);
    expect(view.text()).toContain('原测试仍未确认终态');
    vi.mocked(api.cancelAiRequest).mockResolvedValue({
      requestId: '101',
      status: 'CANCELLED',
    } as AiRequestView);
    await button(view, '取消后续测试').trigger('click');
    await flushPromises();
    expect(api.cancelAiRequest).toHaveBeenCalledWith('101');
    view.unmount();
  });
});
