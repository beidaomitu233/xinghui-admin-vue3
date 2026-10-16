import type { PropType } from 'vue';

import type { AiModelConfig } from '#/api/system/ai-model';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listAiModels } from '#/api/system/ai-model';

import ModelPage from './index.vue';

const accessState = vi.hoisted(() => ({ codes: [] as string[] }));

vi.mock('@vben/common-ui', () => ({
  Page: { template: '<div><slot /></div>' },
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessCodes: accessState.codes }),
}));
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
  ElMessageBox: { confirm: vi.fn() },
  ElLoadingDirective: { mounted: () => {}, updated: () => {} },
  ElAlert: { name: 'ElAlert', render: () => null },
  ElButton: { name: 'ElButton', render: () => null },
  ElCard: { name: 'ElCard', render: () => null },
  ElCheckbox: { name: 'ElCheckbox', render: () => null },
  ElDescriptions: { name: 'ElDescriptions', render: () => null },
  ElDescriptionsItem: { name: 'ElDescriptionsItem', render: () => null },
  ElDialog: { name: 'ElDialog', render: () => null },
  ElEmpty: { name: 'ElEmpty', render: () => null },
  ElForm: { name: 'ElForm', render: () => null },
  ElFormItem: { name: 'ElFormItem', render: () => null },
  ElInput: { name: 'ElInput', render: () => null },
  ElInputNumber: { name: 'ElInputNumber', render: () => null },
  ElOption: { name: 'ElOption', render: () => null },
  ElPagination: { name: 'ElPagination', render: () => null },
  ElSelect: { name: 'ElSelect', render: () => null },
  ElSwitch: { name: 'ElSwitch', render: () => null },
  ElTable: { name: 'ElTable', render: () => null },
  ElTableColumn: { name: 'ElTableColumn', render: () => null },
  ElTag: { name: 'ElTag', render: () => null },
}));
vi.mock('#/api/system/ai-model', () => ({
  createAiModel: vi.fn(),
  getAiModel: vi.fn(),
  listAiModels: vi.fn(),
  removeAiModel: vi.fn(),
  setAiModelEnabled: vi.fn(),
  updateAiModel: vi.fn(),
  saveAiModelCredential: vi.fn(),
  testAiModel: vi.fn(),
}));

const Container = defineComponent({
  props: { title: String, description: String },
  setup(props, { slots }) {
    return () => h('div', [props.title, props.description, slots.default?.()]);
  },
});

const Button = defineComponent({
  emits: ['click'],
  setup(_, { emit, slots }) {
    return () =>
      h('button', { onClick: () => emit('click') }, slots.default?.());
  },
});

const Input = defineComponent({
  props: { modelValue: String },
  emits: ['update:modelValue', 'keyup'],
  setup(_, { emit }) {
    return () =>
      h('input', {
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});

const ModelTable = defineComponent({
  props: {
    data: { type: Array as PropType<AiModelConfig[]>, default: () => [] },
  },
  setup(props) {
    return () =>
      h(
        'div',
        props.data.map((entry) =>
          h(
            'div',
            { class: 'model-row' },
            [
              entry.providerCode,
              entry.modelCode,
              entry.endpointUrl,
              entry.credentialEnvName ?? '',
            ].join(' '),
          ),
        ),
      );
  },
});

function mountPage() {
  return mount(ModelPage, {
    global: {
      stubs: {
        ElAlert: Container,
        ElButton: Button,
        ElCard: Container,
        ElDescriptions: Container,
        ElDescriptionsItem: Container,
        ElDialog: Container,
        ElEmpty: Container,
        ElForm: Container,
        ElFormItem: Container,
        ElInput: Input,
        ElInputNumber: Container,
        ElOption: Container,
        ElPagination: Container,
        ElSelect: Container,
        ElSwitch: Container,
        ElTable: ModelTable,
        ElTableColumn: { template: '<div />' },
        ElTag: Container,
      },
      directives: { loading: () => {} },
    },
  });
}

describe('aI model configuration page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    accessState.codes = [
      'ai:model:list',
      'ai:model:query',
      'ai:model:add',
      'ai:model:edit',
      'ai:model:remove',
    ];
    vi.mocked(listAiModels).mockResolvedValue({
      records: [
        {
          id: 1,
          providerCode: 'openai',
          modelCode: 'gpt-4.1-mini',
          endpointUrl: 'https://api.example.com/v1',
          credentialEnvName: 'OPENAI_API_KEY',
          credentialMode: 'ENV',
          credentialConfigured: false,
          timeoutSeconds: 30,
          enabled: true,
          revision: 0,
          createTime: '2026-09-27T00:00:00',
          updateTime: '2026-09-27T00:00:00',
        },
      ],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    });
  });

  it('loads the server page and displays only the credential reference', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(listAiModels).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 });
    expect(wrapper.text()).toContain('gpt-4.1-mini');
    expect(wrapper.text()).toContain('OPENAI_API_KEY');
    expect(wrapper.text()).toContain('密钥不会回显');
    expect(wrapper.text()).not.toContain('sk-live-secret-value');
  });

  it('offers retry after a list failure', async () => {
    vi.mocked(listAiModels).mockRejectedValueOnce(new Error('offline'));
    const wrapper = mountPage();
    await flushPromises();

    const retry = wrapper
      .findAll('button')
      .find((button) => button.text().includes('重新加载'));
    expect(retry).toBeDefined();
    if (!retry) throw new Error('Reload button missing');
    await retry.trigger('click');
    await flushPromises();
    expect(listAiModels).toHaveBeenCalledTimes(2);
  });

  it('does not query the management API without the list permission', async () => {
    accessState.codes = [];
    const wrapper = mountPage();
    await flushPromises();

    expect(listAiModels).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('无模型配置查看权限');
  });
});
