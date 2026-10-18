import type { SceneDefinition } from '#/api/system/ai-scene';

import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { selectValue } from '#/test-utils/element-controls';

import DatabaseRecordPicker from './DatabaseRecordPicker.vue';
import SceneTrialPanel from './SceneTrialPanel.vue';

vi.mock('./DatabaseRecordPicker.vue', () => ({
  default: { props: ['sourceKey'], template: '<div>有权记录选择器</div>' },
}));

const api = vi.hoisted(() => ({
  previewScene: vi.fn(),
  testScene: vi.fn(),
  getSceneRequest: vi.fn(),
  cancelSceneRequest: vi.fn(),
  sceneEntries: vi.fn(),
}));
const samples = vi.hoisted(() => vi.fn());
const stream = vi.hoisted(() => vi.fn());
const access = vi.hoisted(() => ({ accessCodes: [] as string[] }));
vi.mock('#/api/system/ai-scene', () => api);
vi.mock('#/api/system/ai-scene-data', () => ({ sceneDataSamples: samples }));
vi.mock('#/api/system/ai-application', () => ({ subscribeAiRequest: stream }));
vi.mock('@vben/stores', () => ({ useAccessStore: () => access }));
function definition(): SceneDefinition {
  return {
    name: '通用',
    purpose: '',
    promptText: 'prompt',
    outputRequirement: '',
    dataObjects: [],
    modelPolicy: {
      mode: 'FIXED',
      models: [],
      fallback: false,
      outputFormat: 'TEXT',
      timeoutSeconds: 30,
      maxAttempts: 2,
      maxConcurrent: 2,
      maxTokens: 1024,
    },
  };
}
function button(wrapper: ReturnType<typeof mount>, text: string) {
  const result = wrapper.findAll('button').find((item) => item.text() === text);
  if (!result) throw new Error(`Missing ${text}`);
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  access.accessCodes = ['ai:scene:test', 'ai:scene:invoke'];
  samples.mockResolvedValue({ records: [], total: '0' });
  api.sceneEntries.mockResolvedValue([]);
  api.previewScene.mockResolvedValue({
    sceneKey: 'scene.a',
    sceneVersionId: 'version-4',
    originalMessages: [],
    renderedMessages: [],
    inputSummary: {},
    resourceSummary: {},
    notices: [],
  });
  api.testScene.mockResolvedValue({
    requestId: '10',
    sceneKey: 'scene.a',
    sceneVersionId: 'version-4',
    status: 'SUCCEEDED',
  });
});
describe('explicit scene trial', () => {
  it('resolves dynamic SQL record context from the authorized entry without scanning SQL text', async () => {
    const value = definition();
    value.sqlBindings = [
      {
        variable: 'current_order',
        label: '本次订单',
        description: '读取当前业务记录',
        datasetKeys: ['lowcode.42'],
        query: {
          sql: 'SELECT subject FROM form_42 WHERE record_id = :current_record_id',
          parameters: {},
          maxRows: 20,
        },
      },
    ];
    api.sceneEntries.mockResolvedValue([
      {
        sceneKey: 'scene.a',
        revision: 4,
        contextRequired: true,
        contextSourceKey: 'lowcode.42',
        contextSourceLabel: '本次订单',
      },
    ]);
    const wrapper = mount(SceneTrialPanel, {
      props: {
        sceneKey: 'scene.a',
        revision: 4,
        definition: value,
        versionId: 'version-4',
      },
    });
    await button(wrapper, '试运行').trigger('click');
    await flushPromises();
    expect(wrapper.getComponent(DatabaseRecordPicker).props('sourceKey')).toBe(
      'lowcode.42',
    );
    expect(button(wrapper, '授权预览').attributes('disabled')).toBeDefined();
    wrapper.getComponent(DatabaseRecordPicker).vm.$emit('update:modelValue', {
      key: { id: '7' },
      label: '授权记录',
      values: {},
      businessRef: { type: 'lowcode.record', id: '42:7' },
    });
    await flushPromises();
    await button(wrapper, '授权预览').trigger('click');
    await flushPromises();
    expect(api.previewScene).toHaveBeenCalledWith(
      'scene.a',
      expect.objectContaining({
        expectedRevision: 4,
        businessRef: { type: 'lowcode.record', id: '42:7' },
      }),
    );
    expect(api.testScene).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('shows actual authorized data and rendered messages from the saved snapshot without invoking a provider', async () => {
    api.previewScene.mockResolvedValueOnce({
      sceneKey: 'scene.a',
      sceneVersionId: 'version-4',
      dataValues: { order: { amount: null, subject: '实际授权订单' } },
      reads: [
        {
          variable: 'order',
          sourceKey: 'db.orders',
          rowCount: 1,
          truncated: true,
        },
      ],
      originalMessages: [{ role: 'SYSTEM', content: '概括 {{order}}' }],
      renderedMessages: [{ role: 'SYSTEM', content: '实际发送内容' }],
      inputSummary: {},
      resourceSummary: {},
      notices: [],
    });
    const wrapper = mount(SceneTrialPanel, {
      props: {
        sceneKey: 'scene.a',
        revision: 4,
        definition: definition(),
        versionId: 'version-4',
      },
    });
    await button(wrapper, '试运行').trigger('click');
    await flushPromises();
    await button(wrapper, '授权预览').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('实际授权订单');
    expect(wrapper.text()).toContain('null');
    expect(wrapper.text()).toContain('已截断');
    expect(wrapper.text()).toContain('实际发送内容');
    expect(wrapper.text()).toContain('未调用模型');
    expect(api.testScene).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('previews saved revision without invoking a provider and requires cost confirmation for test', async () => {
    const wrapper = mount(SceneTrialPanel, {
      props: {
        sceneKey: 'scene.a',
        revision: 4,
        definition: definition(),
        versionId: 'version-4',
      },
    });
    await button(wrapper, '试运行').trigger('click');
    await flushPromises();
    expect(wrapper.get('textarea').attributes('maxlength')).toBe('2048');
    await button(wrapper, '授权预览').trigger('click');
    await flushPromises();
    expect(api.previewScene).toHaveBeenCalledWith('scene.a', {
      expectedRevision: 4,
      businessRef: undefined,
      inputs: { user_request: '' },
    });
    expect(api.testScene).not.toHaveBeenCalled();
    expect(button(wrapper, '主动试运行').attributes('disabled')).toBeDefined();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await button(wrapper, '主动试运行').trigger('click');
    await flushPromises();
    expect(api.testScene.mock.calls[0]?.[1]).toMatchObject({
      expectedRevision: 4,
      confirmedCosts: true,
      modelIndex: 0,
      submission: { inputs: { user_request: '' } },
    });
    expect(
      api.testScene.mock.calls[0]?.[1].submission.businessRef,
    ).toBeUndefined();
    wrapper.unmount();
  });
  it('retains original idempotent submission after lost acceptance even if scene revision changes', async () => {
    api.testScene.mockRejectedValueOnce(new Error('offline'));
    const candidates = definition();
    candidates.modelPolicy.models = ['11', '12'].map((id) => ({
      model: { modelRef: id, configVersion: '1' },
      keyMode: 'AUTO',
      allowedKeys: [],
      fixedKey: null,
      fallbackKeys: [],
    }));
    const wrapper = mount(SceneTrialPanel, {
      props: {
        sceneKey: 'scene.a',
        revision: 4,
        definition: candidates,
        versionId: 'version-4',
      },
    });
    await button(wrapper, '试运行').trigger('click');
    await flushPromises();
    await selectValue(wrapper, '试运行组合', 1);
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await button(wrapper, '主动试运行').trigger('click');
    await flushPromises();
    await wrapper.setProps({ revision: 5, versionId: 'version-5' });
    await button(wrapper, '重试原请求').trigger('click');
    await flushPromises();
    expect(api.testScene.mock.calls[1]).toEqual(api.testScene.mock.calls[0]);
    expect(api.testScene.mock.calls[0]?.[1].modelIndex).toBe(1);
    wrapper.unmount();
  });
  it('requires an authorized record selection before previewing a record-bound scene', async () => {
    const value = definition();
    value.dataObjects = [
      { objectKey: 'lowcode.record', formId: '42', fields: ['subject'] },
    ];
    const wrapper = mount(SceneTrialPanel, {
      props: {
        sceneKey: 'scene.a',
        revision: 4,
        definition: value,
        versionId: 'version-4',
      },
    });
    await button(wrapper, '试运行').trigger('click');
    await flushPromises();
    expect(wrapper.getComponent(DatabaseRecordPicker).props('sourceKey')).toBe(
      'lowcode.42',
    );
    expect(samples).not.toHaveBeenCalled();
    expect(button(wrapper, '授权预览').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
