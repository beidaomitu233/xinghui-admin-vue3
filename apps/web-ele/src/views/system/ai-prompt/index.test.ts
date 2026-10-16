import type { PropType } from 'vue';

import type {
  PromptSceneSummary,
  PromptSceneView,
} from '#/api/system/ai-prompt-scene';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  listPromptScenes,
  previewPromptScene,
  publishPromptScene,
} from '#/api/system/ai-prompt-scene';
import { requireTestFixture } from '#/test-utils/required-fixture';

import PromptScenePage from './index.vue';

const accessState = vi.hoisted(() => ({ codes: [] as string[] }));
const apiMocks = vi.hoisted(() => ({
  createPromptScene: vi.fn(),
  getPromptScene: vi.fn(),
  listPromptSceneModels: vi.fn(),
  listPromptScenes: vi.fn(),
  previewPromptScene: vi.fn(),
  publishPromptScene: vi.fn(),
  removePromptScene: vi.fn(),
  setPromptSceneEnabled: vi.fn(),
  updatePromptSceneDraft: vi.fn(),
}));

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
  ElDescriptions: { name: 'ElDescriptions', render: () => null },
  ElDescriptionsItem: { name: 'ElDescriptionsItem', render: () => null },
  ElDialog: { name: 'ElDialog', render: () => null },
  ElEmpty: { name: 'ElEmpty', render: () => null },
  ElForm: { name: 'ElForm', render: () => null },
  ElFormItem: { name: 'ElFormItem', render: () => null },
  ElInput: { name: 'ElInput', render: () => null },
  ElOption: { name: 'ElOption', render: () => null },
  ElPagination: { name: 'ElPagination', render: () => null },
  ElSelect: { name: 'ElSelect', render: () => null },
  ElSwitch: { name: 'ElSwitch', render: () => null },
  ElTable: { name: 'ElTable', render: () => null },
  ElTableColumn: { name: 'ElTableColumn', render: () => null },
  ElTag: { name: 'ElTag', render: () => null },
}));
vi.mock('#/api/system/ai-prompt-scene', () => apiMocks);

const rows = ref<PromptSceneSummary[]>([]);
const Container = defineComponent({
  props: {
    title: String,
    description: String,
    label: String,
    modelValue: [Boolean, Number, String],
  },
  setup(props, { slots }) {
    return () =>
      h('div', [
        props.title,
        props.description,
        props.label,
        slots.default?.(),
        slots.footer?.(),
      ]);
  },
});

const Button = defineComponent({
  props: { disabled: Boolean, loading: Boolean, link: Boolean, type: String },
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

const Table = defineComponent({
  props: {
    data: { type: Array as PropType<PromptSceneSummary[]>, default: () => [] },
  },
  setup(props, { slots }) {
    return () => {
      rows.value = props.data;
      return h('div', { class: 'scene-table' }, slots.default?.());
    };
  },
});

const Column = defineComponent({
  props: { label: String, prop: String },
  setup(props, { slots }) {
    return () =>
      h('div', { class: 'scene-column' }, [
        props.label,
        ...rows.value.map(
          (row) =>
            slots.default?.({ row }) ??
            h('span', String((row as any)[props.prop ?? ''] ?? '')),
        ),
      ]);
  },
});

const summary: PromptSceneSummary = {
  id: 7,
  appKey: 'sample_alpha',
  sceneKey: 'summarize_record',
  draftModelId: 3,
  draftProviderCode: 'openai',
  draftModelCode: 'sample-model',
  draftModelEnabled: true,
  publishedModelId: 3,
  publishedProviderCode: 'openai',
  publishedModelCode: 'sample-model',
  publishedModelEnabled: true,
  published: true,
  draftRevision: 2,
  publishedRevision: 1,
  enabled: true,
  revision: 4,
  updateTime: '2026-09-27T03:00:00',
};

const scene: PromptSceneView = {
  ...summary,
  draftPrompt: 'Summarize {{recordName}}',
  draftVariables: [
    {
      name: 'recordName',
      type: 'STRING',
      description: 'Neutral example name',
      sensitive: false,
      exampleValue: 'Sample record',
    },
  ],
  publishedPrompt: 'Write about {{recordName}}',
  publishedVariables: [
    {
      name: 'recordName',
      type: 'STRING',
      description: 'Neutral example name',
      sensitive: false,
      exampleValue: 'Sample record',
    },
  ],
  createTime: '2026-09-27T02:00:00',
};

function mountPage() {
  return mount(PromptScenePage, {
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
        ElInput: Container,
        ElOption: Container,
        ElPagination: Container,
        ElSelect: Container,
        ElSwitch: Container,
        ElTable: Table,
        ElTableColumn: Column,
        ElTag: Container,
      },
      directives: { loading: () => {} },
    },
  });
}

describe('aI prompt scene page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    accessState.codes = [
      'ai:prompt:list',
      'ai:prompt:query',
      'ai:prompt:add',
      'ai:prompt:edit',
      'ai:prompt:publish',
      'ai:prompt:enable',
      'ai:prompt:remove',
    ];
    rows.value = [];
    apiMocks.listPromptScenes.mockResolvedValue({
      records: [summary],
      total: 1,
      pageNum: 1,
      pageSize: 10,
    });
    apiMocks.getPromptScene.mockResolvedValue(scene);
    apiMocks.listPromptSceneModels.mockResolvedValue([
      { id: 3, providerCode: 'openai', modelCode: 'sample-model' },
    ]);
    apiMocks.publishPromptScene.mockResolvedValue(scene);
    apiMocks.previewPromptScene.mockResolvedValue({
      prompt: 'Summarize Sample record',
      modelId: 3,
      providerCode: 'openai',
      modelCode: 'sample-model',
      draftRevision: 2,
    });
  });

  it('loads distinct app/scene keys and communicates draft and publication state', async () => {
    const wrapper = mountPage();
    await flushPromises();

    expect(listPromptScenes).toHaveBeenCalledWith({ pageNum: 1, pageSize: 10 });
    expect(wrapper.text()).toContain('sample_alpha');
    expect(wrapper.text()).toContain('summarize_record');
    expect(wrapper.text()).toContain('r2');
    expect(wrapper.text()).toContain('r1');
    expect(wrapper.text()).toContain('草稿修改不会影响已发布快照');
  });

  it('publishes using the row revision and reloads the list', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const publishButton = wrapper
      .findAll('button')
      .find((button) => button.text() === '发布');
    expect(publishButton).toBeDefined();
    await requireTestFixture(publishButton).trigger('click');
    await flushPromises();

    expect(publishPromptScene).toHaveBeenCalledWith(
      summary.id,
      summary.revision,
    );
    expect(listPromptScenes).toHaveBeenCalledTimes(2);
  });

  it('previews from declared neutral examples without invoking a model call', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const previewButton = wrapper
      .findAll('button')
      .find((button) => button.text() === '预览');
    expect(previewButton).toBeDefined();
    await requireTestFixture(previewButton).trigger('click');
    await flushPromises();
    const runButton = wrapper
      .findAll('button')
      .find((button) => button.text() === '生成中性预览');
    expect(runButton).toBeDefined();
    await requireTestFixture(runButton).trigger('click');
    await flushPromises();

    expect(previewPromptScene).toHaveBeenCalledWith(summary.id, {
      revision: summary.revision,
      values: { recordName: 'Sample record' },
    });
    expect(wrapper.text()).toContain('Summarize Sample record');
    expect(wrapper.text()).toContain('不调用 AI 模型');
  });

  it('does not call list or show privileged controls without the list permission', async () => {
    accessState.codes = [];
    const wrapper = mountPage();
    await flushPromises();

    expect(listPromptScenes).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('无场景列表查看权限');
    expect(
      wrapper.findAll('button').some((button) => button.text() === '新增场景'),
    ).toBe(false);
  });
});
