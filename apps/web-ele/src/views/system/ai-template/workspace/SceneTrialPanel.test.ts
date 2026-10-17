import type { SceneDefinition } from '#/api/system/ai-scene';

import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import SceneTrialPanel from './SceneTrialPanel.vue';

const api = vi.hoisted(() => ({
  previewScene: vi.fn(),
  testScene: vi.fn(),
  getSceneRequest: vi.fn(),
  cancelSceneRequest: vi.fn(),
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
  it('shows the checked snapshot and summary keys without values, with clear empty states and separate original prompt', async () => {
    access.accessCodes.push('lowcode:record:list', 'lowcode:record:query');
    samples.mockResolvedValue({
      records: [
        { recordId: '7', label: '授权记录', schemaVersion: 1, revision: 1 },
      ],
      total: '1',
    });
    api.previewScene.mockResolvedValueOnce({
      sceneKey: 'scene.a',
      sceneVersionId: 'version-4',
      inputSummary: { user_request: 'PRIVATE_TEST_VALUE' },
      resourceSummary: { 'lowcode.record': 'PRIVATE_RECORD_BODY' },
      renderedMessages: [{ role: 'USER', content: 'PRIVATE_RENDERED_BODY' }],
      originalMessages: [{ role: 'SYSTEM', content: '概括 {{user_request}}' }],
      notices: [],
    });
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
    (wrapper.get('details').element as HTMLDetailsElement).open = true;
    await wrapper.get('details').trigger('toggle');
    await flushPromises();
    await wrapper.get('select[aria-label="试运行样例"]').setValue('7');
    await button(wrapper, '查看授权预览').trigger('click');
    await flushPromises();
    const preview = wrapper.get('[aria-label="授权预览"]');
    expect(
      preview
        .findAll('dl div')
        .map((row) => [row.get('dt').text(), row.get('dd').text()]),
    ).toEqual([
      ['已校验的场景版本', 'version-4'],
      ['输入变量', 'user_request'],
      ['数据对象', 'lowcode.record'],
    ]);
    expect(preview.text()).toContain('测试值与记录正文已隐去');
    expect(preview.text()).toContain('未调用模型');
    expect(preview.text()).not.toMatch(
      /PRIVATE_TEST_VALUE|PRIVATE_RECORD_BODY|PRIVATE_RENDERED_BODY/,
    );
    expect(preview.get('details').attributes('open')).toBeUndefined();
    expect(preview.get('details pre').text()).toBe('概括 {{user_request}}');
    expect(preview.text()).toContain('不代表实际注入模型的消息');
    (preview.get('details').element as HTMLDetailsElement).open = true;
    await preview.get('details').trigger('toggle');
    expect(wrapper.get('details.trial-panel').attributes('open')).toBeDefined();
    expect(api.testScene).not.toHaveBeenCalled();
    expect(stream).not.toHaveBeenCalled();
    wrapper.unmount();
    const empty = mount(SceneTrialPanel, {
      props: {
        sceneKey: 'scene.a',
        revision: 4,
        definition: definition(),
        versionId: 'version-4',
      },
    });
    await button(empty, '查看授权预览').trigger('click');
    await flushPromises();
    expect(empty.get('[aria-label="授权预览"]').text()).toContain('无输入变量');
    expect(empty.get('[aria-label="授权预览"]').text()).toContain('无数据对象');
    empty.unmount();
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
    expect(wrapper.get('textarea').attributes('maxlength')).toBe('2048');
    await button(wrapper, '查看授权预览').trigger('click');
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
    expect(api.testScene.mock.calls[0]?.[1].submission).not.toHaveProperty(
      'businessRef',
    );
    wrapper.unmount();
  });
  it('retains original idempotent submission after lost acceptance even if scene revision changes', async () => {
    api.testScene.mockRejectedValueOnce(new Error('offline'));
    const wrapper = mount(SceneTrialPanel, {
      props: {
        sceneKey: 'scene.a',
        revision: 4,
        definition: definition(),
        versionId: 'version-4',
      },
    });
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await button(wrapper, '主动试运行').trigger('click');
    await flushPromises();
    await wrapper.setProps({ revision: 5, versionId: 'version-5' });
    await button(wrapper, '重试原请求').trigger('click');
    await flushPromises();
    expect(api.testScene.mock.calls[1]).toEqual(api.testScene.mock.calls[0]);
    wrapper.unmount();
  });
  it('does not fetch sample lists or submit records when the actor lacks list permission', async () => {
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
    await wrapper.get('details').trigger('toggle');
    await flushPromises();
    expect(wrapper.text()).toContain('没有记录列表权限');
    expect(samples).not.toHaveBeenCalled();
    expect(
      button(wrapper, '查看授权预览').attributes('disabled'),
    ).toBeDefined();
    wrapper.unmount();
  });
});
