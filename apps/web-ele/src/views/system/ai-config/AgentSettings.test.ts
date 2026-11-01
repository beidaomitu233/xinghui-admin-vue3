import type { SceneDetail } from '#/api/system/ai-scene';

import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

import ElementPlus from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getScene,
  getSceneWorkspace,
  saveScene,
  sceneModels,
} from '#/api/system/ai-scene';

import AgentSettings from './AgentSettings.vue';

const access = reactive({
  accessToken: 'actor-a',
  accessCodes: ['list', 'query', 'edit', 'enable'].map(
    (action) => `ai:scene:${action}`,
  ),
});
vi.mock('@vben/stores', () => ({ useAccessStore: () => access }));
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }));
vi.mock('#/api/system/ai-scene', () => ({
  createScene: vi.fn(),
  getScene: vi.fn(),
  getSceneWorkspace: vi.fn(),
  saveScene: vi.fn(),
  sceneModels: vi.fn(),
  setSceneEnabled: vi.fn(),
}));
function detail(promptText = '当前账号的业务助手'): SceneDetail {
  return {
    legacy: null,
    scene: {
      sceneKey: 'qa.agent',
      name: 'AI 中台',
      purpose: '',
      kind: 'AGENT',
      enabled: true,
      revision: 4,
      currentVersionId: '10',
      formId: null,
      source: 'NATIVE',
      updatedAt: '',
      availability: { state: 'READY', reasons: [] },
    },
    definition: {
      name: 'AI 中台',
      purpose: '',
      promptText,
      outputRequirement: '',
      dataObjects: [],
      businessModels: ['qa-model'],
      modelPolicy: {
        mode: 'FIXED',
        models: [],
        fallback: true,
        maxAttempts: 8,
        maxConcurrent: 2,
        maxTokens: 4096,
        outputFormat: 'TEXT',
        timeoutSeconds: 120,
      },
    },
  };
}
function page() {
  return mount(AgentSettings, {
    props: { models: [] },
    global: { plugins: [ElementPlus], stubs: { ModelPriorityEditor: true } },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  access.accessToken = 'actor-a';
  access.accessCodes = ['list', 'query', 'edit', 'enable'].map(
    (action) => `ai:scene:${action}`,
  );
  vi.mocked(getSceneWorkspace).mockResolvedValue({
    scenes: { records: [detail().scene], total: '1', pageNum: 1, pageSize: 20 },
    selected: null,
  });
  vi.mocked(getScene).mockResolvedValue(detail());
  vi.mocked(sceneModels).mockResolvedValue([]);
});
describe('single Agent settings persistence', () => {
  it('retries an unknown save with the same revision, mutation id and frozen body', async () => {
    vi.mocked(saveScene)
      .mockRejectedValueOnce(new Error('lost acknowledgement'))
      .mockImplementationOnce(async (_key, body) => ({
        clientMutationId: body.clientMutationId,
        effectiveFrom: null,
        detail: {
          ...detail('新的职责'),
          scene: { ...detail().scene, revision: 5 },
        },
      }));
    const wrapper = page();
    await flushPromises();
    await wrapper.get('textarea').setValue('新的职责');
    const save = () => {
      const button = wrapper
        .findAll('button')
        .find((button) => ['保存设置', '重试保存'].includes(button.text()));
      if (!button) throw new Error('Missing save control');
      return button;
    };
    await save().trigger('click');
    await flushPromises();
    expect(wrapper.get('textarea').attributes('readonly')).toBeDefined();
    expect(save().text()).toBe('重试保存');
    await save().trigger('click');
    await flushPromises();
    expect(vi.mocked(saveScene).mock.calls[1]?.[1]).toEqual(
      vi.mocked(saveScene).mock.calls[0]?.[1],
    );
    expect(save().attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
  it('does not display an old account prompt after a delayed read completes', async () => {
    let finishOld!: (value: SceneDetail) => void;
    vi.mocked(getScene)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValue(detail('NEW_SCOPE_PROMPT'));
    const wrapper = page();
    await flushPromises();
    access.accessToken = 'actor-b';
    await flushPromises();
    finishOld(detail('OLD_SCOPE_SECRET'));
    await flushPromises();
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
      'NEW_SCOPE_PROMPT',
    );
    expect(wrapper.html()).not.toContain('OLD_SCOPE_SECRET');
    wrapper.unmount();
  });
});
