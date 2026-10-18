import type { SceneModelPolicy } from '#/api/system/ai-scene';

import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

import ElementPlus, { ElMessageBox } from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { click, selectValue } from '#/test-utils/element-controls';

import SceneRouteEditor from './SceneRouteEditor.vue';
import SceneRoutingWorkspace from './SceneRoutingWorkspace.vue';

const rawAccess = vi.hoisted(() => ({
  accessToken: 'actor-a',
  accessCodes: [] as string[],
}));
const store = reactive(rawAccess);
const api = vi.hoisted(() => ({
  get: vi.fn(),
  save: vi.fn(),
  scenes: vi.fn(),
  models: vi.fn(),
  keys: vi.fn(),
  bodySave: vi.fn(),
  hubModels: vi.fn(),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => store }));
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }));
vi.mock('#/api/system/ai-model-hub', () => ({ listHubModels: api.hubModels }));
vi.mock('#/api/system/ai-scene', () => ({
  getSceneWorkspace: api.scenes,
  sceneModels: api.models,
  sceneKeys: api.keys,
  saveScene: api.bodySave,
}));
vi.mock('#/api/system/ai-scene-routing', () => ({
  getSceneRouting: api.get,
  saveSceneRouting: api.save,
}));
function policy(): SceneModelPolicy {
  return {
    mode: 'FIXED',
    fallback: true,
    models: [
      {
        model: { modelRef: 'model-a', configVersion: '1' },
        keyMode: 'FIXED',
        allowedKeys: [],
        fixedKey: { keyRef: 'key-a', keyVersion: '1' },
        fallbackKeys: [{ keyRef: 'key-b', keyVersion: '2' }],
      },
    ],
    outputFormat: 'TEXT',
    timeoutSeconds: 30,
    maxAttempts: 2,
    maxConcurrent: 2,
    maxTokens: 1024,
  };
}
const wrappers: ReturnType<typeof mount>[] = [];
async function render() {
  const wrapper = mount(SceneRoutingWorkspace, {
    attachTo: document.body,
    props: { initialSceneKey: 'scene.a' },
    global: { plugins: [ElementPlus] },
  });
  wrappers.push(wrapper);
  await flushPromises();
  await flushPromises();
  return wrapper;
}
async function change(wrapper: ReturnType<typeof mount>) {
  wrapper
    .getComponent(SceneRouteEditor)
    .vm.$emit('change', { ...policy(), fallback: false });
  await flushPromises();
}
beforeEach(() => {
  vi.resetAllMocks();
  api.hubModels.mockResolvedValue({ records: [], total: '0' });
  store.accessToken = 'actor-a';
  store.accessCodes = [
    'ai:config:query',
    'ai:config:edit',
    'ai:scene:list',
    'ai:scene:query',
    'ai:scene:edit',
  ];
  api.get.mockResolvedValue({
    sceneKey: 'scene.a',
    revision: 4,
    currentVersionId: 'v4',
    modelPolicy: policy(),
  });
  api.save.mockImplementation(async (_key, body) => ({
    routing: {
      sceneKey: 'scene.a',
      revision: 5,
      currentVersionId: 'v5',
      modelPolicy: body.modelPolicy,
      businessModel: body.businessModel ?? null,
    },
    clientMutationId: body.clientMutationId,
    effectiveFrom: '2026-10-18T06:00:00Z',
  }));
  api.scenes.mockResolvedValue({
    scenes: { records: [{ sceneKey: 'scene.a', name: '订单分析' }] },
  });
  api.models.mockResolvedValue([
    {
      configId: 'channel-a',
      configName: '主渠道',
      modelCode: 'vendor/a',
      providerCode: 'openrouter',
      model: { modelRef: 'model-a', configVersion: '1' },
      outputFormats: ['TEXT'],
      streaming: true,
      usableKeyCount: 2,
    },
  ]);
  api.keys.mockResolvedValue([
    {
      key: { keyRef: 'key-a', keyVersion: '1' },
      maskedLabel: '主账号 · ••••1234',
    },
    {
      key: { keyRef: 'key-b', keyVersion: '2' },
      maskedLabel: '备用账号 · ••••5678',
    },
  ]);
  vi.spyOn(ElMessageBox, 'confirm').mockImplementation(
    vi.fn().mockResolvedValue('confirm'),
  );
});
afterEach(async () => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  await flushPromises();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
describe('independent scene routing with shared revision CAS', () => {
  it('explicitly switches a scene to a business model without reconstructing its provider or key policy', async () => {
    api.hubModels.mockResolvedValue({
      records: [
        { modelId: 'business-1', name: '客服模型', slug: 'customer-chat' },
      ],
      total: '1',
    });
    const wrapper = await render();
    await selectValue(wrapper, '场景逻辑业务模型', 'customer-chat');
    await click('保存调用顺序');
    expect(api.save).toHaveBeenCalledWith('scene.a', {
      expectedRevision: 4,
      clientMutationId: expect.any(String),
      modelPolicy: null,
      businessModel: 'customer-chat',
    });
    expect(api.bodySave).not.toHaveBeenCalled();
    expect(wrapper.findComponent(SceneRouteEditor).exists()).toBe(false);
  });
  it('saves only routing through its narrow endpoint and retains fixed-key restrictions', async () => {
    const wrapper = await render();
    expect(api.get).toHaveBeenCalledTimes(1);
    await change(wrapper);
    await click('保存调用顺序');
    expect(api.save).toHaveBeenCalledWith('scene.a', {
      expectedRevision: 4,
      clientMutationId: expect.any(String),
      modelPolicy: { ...policy(), fallback: false },
    });
    expect(api.save.mock.calls[0]?.[1]).not.toHaveProperty('definition');
    expect(api.bodySave).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('调用顺序已保存');
  });
  it('preserves a frozen original mutation after an uncertain acknowledgement', async () => {
    api.save.mockRejectedValueOnce(new Error('lost response'));
    const wrapper = await render();
    await change(wrapper);
    await click('保存调用顺序');
    const body = api.save.mock.calls[0]?.[1];
    expect(wrapper.getComponent(SceneRouteEditor).props('readonly')).toBe(true);
    await click('重试原保存');
    expect(api.save.mock.calls[1]?.[1]).toEqual(body);
    expect(api.bodySave).not.toHaveBeenCalled();
  });
  it('keeps conflicted local input until an explicit reread and does not grant missing edit permissions', async () => {
    api.save.mockRejectedValueOnce({ response: { status: 409 } });
    const wrapper = await render();
    await change(wrapper);
    await click('保存调用顺序');
    expect(wrapper.getComponent(SceneRouteEditor).props('value').fallback).toBe(
      false,
    );
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('场景已有更新');
    await click('重新读取');
    expect(ElMessageBox.confirm).toHaveBeenCalledOnce();
    expect(api.get).toHaveBeenCalledTimes(2);
    store.accessCodes = ['ai:config:query', 'ai:scene:query'];
    await flushPromises();
    await flushPromises();
    expect(wrapper.getComponent(SceneRouteEditor).props('readonly')).toBe(true);
    expect(document.body.textContent).not.toContain('保存调用顺序');
  });
  it('requires both query permissions and does not fetch route content for a config-only actor', async () => {
    store.accessCodes = ['ai:config:query'];
    await render();
    expect(api.get).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
    expect(api.keys).not.toHaveBeenCalled();
  });
});
