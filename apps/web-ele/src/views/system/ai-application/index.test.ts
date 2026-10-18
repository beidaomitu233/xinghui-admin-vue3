import type { SceneDetail } from '#/api/system/ai-scene';

import { flushPromises, mount } from '@vue/test-utils';

import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ApplicationEntry from './index.vue';

const access = vi.hoisted(() => ({ accessCodes: [] as string[] }));
const scenes = vi.hoisted(() => ({
  getSceneWorkspace: vi.fn(),
  getScene: vi.fn(),
  sceneModels: vi.fn(),
  saveScene: vi.fn(),
}));
const legacy = vi.hoisted(() => ({ listDefinitions: vi.fn() }));
const applications = vi.hoisted(() => ({
  createApplication: vi.fn(),
  publishApplication: vi.fn(),
  rollbackApplication: vi.fn(),
  listApplications: vi.fn(),
  updateApplicationDraft: vi.fn(),
  subscribeAiRequest: vi.fn(),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => access }));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<section><slot /></section>' },
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}));
vi.mock('#/api/system/ai-scene', () => scenes);
vi.mock('#/api/system/ai-template', () => legacy);
vi.mock('#/api/system/ai-application', () => applications);
vi.mock('#/api/system/ai-scene-data', () => ({
  sceneDataCatalog: vi.fn(async () => ({ objects: [], inputVariables: [] })),
  sceneDataForms: vi.fn(async () => ({ records: [], total: '0' })),
  sceneDataFields: vi.fn(async () => ({ fields: [] })),
}));
const detail: SceneDetail = {
  legacy: null,
  scene: {
    sceneKey: 'scene.compatibility',
    name: '兼容入口场景',
    purpose: '',
    kind: 'GENERAL',
    formId: null,
    source: 'NATIVE',
    enabled: true,
    revision: 4,
    currentVersionId: 'version-4',
    availability: { state: 'READY', reasons: [] },
    updatedAt: '2026-10-17T00:00:00Z',
  },
  definition: {
    name: '兼容入口场景',
    purpose: '',
    promptText: '当前有效提示词',
    outputRequirement: '',
    dataObjects: [],
    modelPolicy: {
      mode: 'FIXED',
      models: [
        {
          model: { modelRef: '17', configVersion: '8' },
          keyMode: 'AUTO',
          allowedKeys: [],
          fixedKey: null,
          fallbackKeys: [],
        },
      ],
      fallback: false,
      outputFormat: 'TEXT',
      timeoutSeconds: 30,
      maxAttempts: 2,
      maxConcurrent: 2,
      maxTokens: 1024,
    },
  },
};
const wrappers: ReturnType<typeof mount>[] = [];
async function render(codes: string[]) {
  access.accessCodes = codes;
  const wrapper = mount(ApplicationEntry, {
    global: { plugins: [ElementPlus] },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  scenes.getSceneWorkspace.mockResolvedValue({
    scenes: { records: [detail.scene], pageNum: 1, pageSize: 100, total: '1' },
    selected: null,
  });
  scenes.getScene.mockResolvedValue(detail);
  scenes.sceneModels.mockResolvedValue([]);
  legacy.listDefinitions.mockResolvedValue({
    records: [],
    total: '0',
    pageNum: 1,
    pageSize: 20,
  });
  scenes.saveScene.mockImplementation(async (_key, input) => ({
    clientMutationId: input.clientMutationId,
    effectiveFrom: '2026-10-17T00:01:00Z',
    detail: {
      ...detail,
      // The body endpoint preserves routing omitted by the prompt editor.
      definition: {
        ...detail.definition,
        ...input.definition,
        initialModel: null,
      },
      scene: {
        ...detail.scene,
        revision: input.expectedRevision + 1,
        currentVersionId: 'version-5',
      },
    },
  }));
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  for (const call of Object.values(applications))
    expect(call).not.toHaveBeenCalled();
  vi.useRealTimers();
});

describe('old application entry delegates to the authorized prompt workspace', () => {
  it('loads the real scene workspace without restoring application creation or publication controls', async () => {
    const wrapper = await render([
      'ai:scene:list',
      'ai:scene:query',
      'ai:scene:add',
    ]);
    expect(wrapper.find('.scene-sidebar').exists()).toBe(true);
    expect(scenes.getSceneWorkspace).toHaveBeenCalledOnce();
    expect(wrapper.text()).not.toMatch(/新建应用|发布当前版本|回滚/);
    expect(legacy.listDefinitions).not.toHaveBeenCalled();
  });
  it('does not turn old application actions into scene access', async () => {
    const wrapper = await render(
      ['list', 'query', 'add', 'edit', 'test', 'publish'].map(
        (action) => `ai:application:${action}`,
      ),
    );
    expect(wrapper.text()).toContain('暂无提示词配置访问权限');
    expect(scenes.getSceneWorkspace).not.toHaveBeenCalled();
    expect(legacy.listDefinitions).not.toHaveBeenCalled();
  });
  it('requires query separately from scene list before reading prompt content', async () => {
    const wrapper = await render(['ai:scene:list']);
    await wrapper.get('.scene-item').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('当前无场景详情权限');
    expect(scenes.getScene).not.toHaveBeenCalled();
    expect(scenes.sceneModels).not.toHaveBeenCalled();
  });
  it('keeps the actual scene editor readonly for list and query viewers', async () => {
    const wrapper = await render(['ai:scene:list', 'ai:scene:query']);
    await wrapper.get('.scene-item').trigger('click');
    await flushPromises();
    expect(
      wrapper.get('textarea[aria-label="提示词"]').attributes('readonly'),
    ).toBeDefined();
    await vi.advanceTimersByTimeAsync(600);
    expect(scenes.saveScene).not.toHaveBeenCalled();
  });
  it('saves edited scenes through CAS with no old application draft or publish calls', async () => {
    const wrapper = await render([
      'ai:scene:list',
      'ai:scene:query',
      'ai:scene:edit',
    ]);
    await wrapper.get('.scene-item').trigger('click');
    await flushPromises();
    await wrapper
      .get('textarea[aria-label="提示词"]')
      .setValue('修改后直接保存的指令');
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    expect(scenes.saveScene).toHaveBeenCalledWith(
      'scene.compatibility',
      expect.objectContaining({
        expectedRevision: 4,
        clientMutationId: expect.any(String),
        definition: expect.objectContaining({
          promptText: '修改后直接保存的指令',
        }),
      }),
    );
    expect(wrapper.find('[data-phase="saved"]').exists()).toBe(true);
  });
  it('preserves the approved resource workspace for data-only legacy roles without calling scene APIs', async () => {
    const wrapper = await render(['ai:data:list', 'ai:data:query']);
    expect(legacy.listDefinitions.mock.calls[0]?.[0]).toBe('data-resources');
    expect(wrapper.find('.scene-sidebar').exists()).toBe(false);
    expect(scenes.getSceneWorkspace).not.toHaveBeenCalled();
    expect(scenes.getScene).not.toHaveBeenCalled();
  });
  it('preserves the template workspace for legacy template roles without granting direct-save scenes', async () => {
    const wrapper = await render(['ai:template:list', 'ai:template:query']);
    expect(legacy.listDefinitions.mock.calls[0]?.[0]).toBe('templates');
    expect(wrapper.find('.scene-sidebar').exists()).toBe(false);
    expect(scenes.getSceneWorkspace).not.toHaveBeenCalled();
    expect(scenes.saveScene).not.toHaveBeenCalled();
  });
  it('uses new scenes in preference to the legacy workspace only when scene list is actually granted', async () => {
    const wrapper = await render([
      'ai:scene:list',
      'ai:scene:query',
      'ai:template:list',
      'ai:data:list',
    ]);
    expect(wrapper.find('.scene-sidebar').exists()).toBe(true);
    expect(scenes.getSceneWorkspace).toHaveBeenCalledOnce();
    expect(legacy.listDefinitions).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toMatch(/稳定入口标识|模板版本 ID|发布当前版本/);
  });
});
