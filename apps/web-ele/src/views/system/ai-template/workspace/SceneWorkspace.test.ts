import type {
  SceneDefinition,
  SceneDetail,
  SceneSaveResult,
} from '#/api/system/ai-scene';

import { flushPromises, mount } from '@vue/test-utils';
import { h, KeepAlive, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SceneWorkspace from './SceneWorkspace.vue';

const api = vi.hoisted(() => ({
  createScene: vi.fn(),
  getScene: vi.fn(),
  getSceneWorkspace: vi.fn(),
  saveScene: vi.fn(),
  sceneModels: vi.fn(),
  setSceneEnabled: vi.fn(),
}));
const access = vi.hoisted(() => ({ accessCodes: [] as string[] }));
const navigation = vi.hoisted(() => ({
  guard: undefined as (() => boolean | Promise<boolean>) | undefined,
}));
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: (guard: () => boolean | Promise<boolean>) => {
    navigation.guard = guard;
  },
}));
vi.mock('#/api/system/ai-scene', () => api);
vi.mock('#/api/system/ai-application', () => ({ subscribeAiRequest: vi.fn() }));
vi.mock('#/api/system/ai-scene-data', () => ({
  sceneDataCatalog: vi.fn(async () => ({
    objects: [],
    inputVariables: [
      {
        name: 'user_request',
        label: '用户要求',
        type: 'STRING',
        required: false,
        maxChars: 8000,
      },
    ],
  })),
  sceneDataForms: vi.fn(async () => ({
    records: [],
    total: '0',
    pageNum: 1,
    pageSize: 20,
  })),
  sceneDataFields: vi.fn(async () => ({ fields: [] })),
  sceneDataSamples: vi.fn(async () => ({
    records: [],
    total: '0',
    pageNum: 1,
    pageSize: 20,
  })),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => access }));
const wrappers: ReturnType<typeof mount>[] = [];
function definition(name: string): SceneDefinition {
  return {
    name,
    purpose: '场景用途',
    promptText: `${name}原始提示词`,
    outputRequirement: '',
    dataObjects: [],
    modelPolicy: {
      mode: 'FIXED',
      fallback: false,
      models: [
        {
          model: { modelRef: '1', configVersion: '2' },
          keyMode: 'AUTO',
          allowedKeys: [],
          fixedKey: null,
          fallbackKeys: [],
        },
      ],
      outputFormat: 'TEXT',
      timeoutSeconds: 30,
      maxAttempts: 2,
      maxConcurrent: 2,
      maxTokens: 1024,
    },
  };
}
function detail(
  key: string,
  revision = 1,
  value = definition(key),
): SceneDetail {
  return {
    legacy: null,
    definition: value,
    scene: {
      sceneKey: key,
      name: key,
      purpose: '场景用途',
      kind: 'GENERAL',
      formId: null,
      source: 'NATIVE',
      enabled: true,
      revision,
      currentVersionId: `version-${revision}`,
      availability: { state: 'READY', reasons: [] },
      updatedAt: '2026-10-17T00:00:00Z',
    },
  };
}
function response(
  key: string,
  input: {
    clientMutationId: string;
    definition: SceneDefinition;
    expectedRevision: number;
  },
): SceneSaveResult {
  return {
    clientMutationId: input.clientMutationId,
    detail: detail(key, input.expectedRevision + 1, input.definition),
    effectiveFrom: '2026-10-17T00:00:01Z',
  };
}
async function open() {
  const wrapper = mount(SceneWorkspace);
  wrappers.push(wrapper);
  await flushPromises();
  await wrapper.get('.scene-item').trigger('click');
  await flushPromises();
  return wrapper;
}
beforeEach(() => {
  navigation.guard = undefined;
  vi.useFakeTimers();
  vi.clearAllMocks();
  access.accessCodes = ['list', 'query', 'edit', 'add', 'enable'].map(
    (action) => `ai:scene:${action}`,
  );
  api.getSceneWorkspace.mockResolvedValue({
    scenes: {
      records: [detail('first').scene, detail('second').scene],
      total: '2',
      pageNum: 1,
      pageSize: 100,
    },
    selected: null,
  });
  api.getScene.mockImplementation(async (key: string) => detail(key));
  api.sceneModels.mockResolvedValue([]);
  api.saveScene.mockImplementation(async (key, input) => response(key, input));
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.useRealTimers();
});

describe('scene workspace actual editing and autosave', () => {
  it('maps whitelisted definition and array field diagnostics into local editor errors', async () => {
    api.saveScene.mockRejectedValue({
      response: {
        status: 400,
        data: {
          data: {
            fields: [
              { field: 'definition.promptText', code: 'MISSING_VARIABLE' },
              {
                field: 'definition.dataObjects[0].fields',
                code: 'FIELD_FORBIDDEN',
              },
              { field: 'stack.trace', code: 'do-not-display' },
            ],
          },
        },
      },
    });
    const wrapper = await open();
    await wrapper.get('textarea[aria-label="提示词"]').setValue('无效输入保留');
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    expect(wrapper.text()).toContain('提示词配置不符合要求');
    expect(wrapper.text()).toContain('数据对象或允许字段配置不符合要求');
    expect(wrapper.text()).not.toContain('do-not-display');
    expect(wrapper.get('textarea[aria-label="提示词"]').element).toHaveProperty(
      'value',
      '无效输入保留',
    );
  });
  it('flushes legal pending textarea edits before allowing route leave', async () => {
    const wrapper = await open();
    await wrapper.get('textarea[aria-label="提示词"]').setValue('离开前保存');
    const leaving = navigation.guard?.();
    await flushPromises();
    expect(await leaving).toBe(true);
    expect(api.saveScene.mock.calls[0]?.[1].definition.promptText).toBe(
      '离开前保存',
    );
    expect(wrapper.find('[data-phase="saved"]').exists()).toBe(true);
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });
  it.each([409, 503])(
    'blocks leaving after HTTP %s, warns on refresh, and requires an explicit discard decision',
    async (status) => {
      api.saveScene.mockRejectedValue({ response: { status } });
      const wrapper = await open();
      await wrapper
        .get('textarea[aria-label="提示词"]')
        .setValue('不能静默丢失');
      await vi.advanceTimersByTimeAsync(600);
      await flushPromises();
      const leaving = navigation.guard?.();
      await flushPromises();
      expect(wrapper.find('[aria-label="离开前处理未确认内容"]').exists()).toBe(
        true,
      );
      const unload = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(true);
      await wrapper
        .findAll('button')
        .find((button) => button.text() === '留在当前页')
        ?.trigger('click');
      expect(await leaving).toBe(false);
      expect(
        wrapper.get('textarea[aria-label="提示词"]').element,
      ).toHaveProperty('value', '不能静默丢失');
      const discarding = navigation.guard?.();
      await flushPromises();
      await wrapper
        .findAll('button')
        .find((button) => button.text() === '放弃未确认内容并离开')
        ?.trigger('click');
      expect(await discarding).toBe(true);
    },
  );
  it('protects unknown creation outcomes and lets clean unconfigured scenes leave directly', async () => {
    api.getScene.mockResolvedValue({
      ...detail('first', 0),
      definition: null,
      scene: { ...detail('first', 0).scene, currentVersionId: null },
    });
    const wrapper = await open();
    expect(navigation.guard?.()).toBe(true);
    const cleanUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanUnload);
    expect(cleanUnload.defaultPrevented).toBe(false);
    api.createScene.mockRejectedValue(new Error('unknown acceptance'));
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '新建场景')
      ?.trigger('click');
    await wrapper.get('.create-dialog input').setValue('结果未知的新建');
    await wrapper.get('form.create-dialog').trigger('submit');
    await flushPromises();
    const leaving = navigation.guard?.();
    await flushPromises();
    expect(wrapper.get('[aria-label="离开前处理未确认内容"]').text()).toContain(
      '未确认',
    );
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '留在当前页')
      ?.trigger('click');
    expect(await leaving).toBe(false);
  });
  it('preserves the same failed editor instance across KeepAlive deactivation and activation', async () => {
    api.saveScene.mockRejectedValue(new Error('offline'));
    const shown = ref(true);
    const wrapper = mount({
      setup: () => () =>
        h(KeepAlive, () => (shown.value ? h(SceneWorkspace) : h('div'))),
    });
    wrappers.push(wrapper);
    await flushPromises();
    await wrapper.get('.scene-item').trigger('click');
    await flushPromises();
    const original = wrapper.getComponent(SceneWorkspace).vm.$.uid;
    await wrapper
      .get('textarea[aria-label="提示词"]')
      .setValue('缓存回切保留的输入');
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    shown.value = false;
    await flushPromises();
    shown.value = true;
    await flushPromises();
    expect(wrapper.getComponent(SceneWorkspace).vm.$.uid).toBe(original);
    expect(wrapper.get('textarea[aria-label="提示词"]').element).toHaveProperty(
      'value',
      '缓存回切保留的输入',
    );
    expect(wrapper.find('[data-phase="error"]').exists()).toBe(true);
  });
  it('creates an unconfigured identity with optional purpose without auto-saving a definition', async () => {
    api.createScene.mockResolvedValue({
      ...detail('new-scene', 0),
      definition: null,
    });
    api.getScene.mockImplementation(async (key: string) =>
      key === 'new-scene'
        ? {
            ...detail(key, 0),
            definition: null,
            scene: { ...detail(key, 0).scene, currentVersionId: null },
          }
        : detail(key),
    );
    const wrapper = await open();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '新建场景')
      ?.trigger('click');
    await wrapper.get('.create-dialog input').setValue('新场景');
    await wrapper.get('.create-dialog').trigger('submit');
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.createScene.mock.calls[0]?.[0]).toMatchObject({
      name: '新场景',
      purpose: '',
      kind: 'GENERAL',
      formId: null,
    });
    expect(api.saveScene).not.toHaveBeenCalled();
  });
  it('retries an uncertain create with the original mutation and keeps its input frozen', async () => {
    api.createScene
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ...detail('new-scene', 0), definition: null });
    const wrapper = await open();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '新建场景')
      ?.trigger('click');
    await wrapper.get('.create-dialog input').setValue('新场景');
    await wrapper.get('.create-dialog').trigger('submit');
    await flushPromises();
    expect(
      wrapper.get('.create-dialog input').attributes('disabled'),
    ).toBeDefined();
    const original = api.createScene.mock.calls[0]?.[0];
    await wrapper.get('.create-dialog').trigger('submit');
    await flushPromises();
    expect(api.createScene.mock.calls[1]?.[0]).toEqual(original);
  });
  it('does not save an untouched unconfigured scene and allows switching away', async () => {
    api.getScene.mockImplementation(async (key: string) =>
      key === 'first'
        ? {
            ...detail(key, 0),
            definition: null,
            scene: { ...detail(key, 0).scene, currentVersionId: null },
          }
        : detail(key),
    );
    const wrapper = await open();
    expect(wrapper.text()).toContain('尚未保存有效配置');
    await vi.advanceTimersByTimeAsync(1000);
    await wrapper.findAll('.scene-item')[1]?.trigger('click');
    await flushPromises();
    expect(wrapper.get('h1').text()).toBe('second');
    expect(api.saveScene).not.toHaveBeenCalled();
  });
  it('keeps a READ_ONLY legacy scene intact without substituting an editable blank definition', async () => {
    api.getScene.mockResolvedValue({
      ...detail('first'),
      definition: null,
      legacy: {
        compatibility: 'READ_ONLY',
        requiresConfirmation: false,
        reasons: ['TEMPLATE_DISABLED', 'FUTURE_COMPATIBILITY_REASON'],
        conversionNotes: [],
        editor: null,
        originalMessages: [{ section: 'INSTRUCTION', text: '原始有效提示词' }],
        originalDefinition: {},
      },
    });
    const wrapper = await open();
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.text()).toContain('原始有效提示词');
    expect(wrapper.get('.legacy-notice').text()).toContain(
      '原提示词模板已停用。',
    );
    expect(wrapper.get('.legacy-notice').text()).toContain(
      '存在未说明的兼容性信息，请查看原内容。',
    );
    expect(wrapper.get('.legacy-notice').text()).not.toMatch(
      /TEMPLATE_DISABLED|FUTURE_COMPATIBILITY_REASON/,
    );
    expect(wrapper.find('textarea[aria-label="提示词"]').exists()).toBe(false);
    expect(api.saveScene).not.toHaveBeenCalled();
  });
  it('loads a convertible legacy scene without saving and sends explicit consent only with the first actual edit', async () => {
    api.getScene.mockResolvedValue({
      ...detail('first'),
      legacy: {
        compatibility: 'CONVERTIBLE',
        requiresConfirmation: true,
        reasons: [],
        conversionNotes: [
          'MESSAGE_SECTIONS_COMBINED_AS_USER',
          'NULLS_PRESERVED_BY_BUILTIN_READER',
          'FUTURE_CONVERSION_NOTE',
        ],
        editor: {
          promptText: definition('first').promptText,
          outputRequirement: '',
          dataObjects: [],
        },
        originalMessages: [],
        originalDefinition: {},
      },
    });
    const wrapper = await open();
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.get('.legacy-notice').text()).toContain(
      '原消息分区将合并为用户消息。',
    );
    expect(wrapper.get('.legacy-notice').text()).toContain(
      '读取业务数据时保留原有空值。',
    );
    expect(wrapper.get('.legacy-notice').text()).toContain(
      '另有一项转换说明暂未提供详情，请查看原内容。',
    );
    expect(wrapper.get('.legacy-notice').text()).not.toMatch(
      /MESSAGE_SECTIONS_COMBINED_AS_USER|NULLS_PRESERVED_BY_BUILTIN_READER|FUTURE_CONVERSION_NOTE/,
    );
    expect(api.saveScene).not.toHaveBeenCalled();
    expect(
      wrapper.get('textarea[aria-label="提示词"]').attributes('readonly'),
    ).toBeDefined();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === '确认转换说明，开始编辑')
      ?.trigger('click');
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.saveScene).not.toHaveBeenCalled();
    await wrapper
      .get('textarea[aria-label="提示词"]')
      .setValue('明确修改后的指令');
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    expect(api.saveScene.mock.calls[0]?.[1].confirmedLegacyConversion).toBe(
      true,
    );
    expect(wrapper.text()).not.toContain('确认转换说明，开始编辑');
    await wrapper.get('textarea[aria-label="提示词"]').setValue('后续修改');
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    expect(api.saveScene.mock.calls[1]?.[1].confirmedLegacyConversion).toBe(
      false,
    );
  });
  it('coalesces textarea typing, shows saving until acknowledgement and submits the exact HTTP body', async () => {
    let acknowledge: ((value: SceneSaveResult) => void) | undefined;
    api.saveScene.mockImplementation(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    const wrapper = await open();
    await wrapper.get('textarea[aria-label="提示词"]').setValue('连续输入一');
    await vi.advanceTimersByTimeAsync(400);
    await wrapper.get('textarea[aria-label="提示词"]').setValue('连续输入二');
    await vi.advanceTimersByTimeAsync(599);
    expect(api.saveScene).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.get('[role="status"]').text()).toContain('正在保存');
    const [key, input] = api.saveScene.mock.calls[0] ?? [];
    expect(key).toBe('first');
    expect(input).toMatchObject({
      expectedRevision: 1,
      definition: { promptText: '连续输入二' },
    });
    expect(input).not.toHaveProperty('appId');
    expect(input.clientMutationId).toBeTruthy();
    acknowledge?.(response(key, input));
    await flushPromises();
    expect(wrapper.find('[data-phase="saved"]').text()).toContain('已保存');
  });
  it('keeps offline edits and refuses to switch until the original mutation is acknowledged', async () => {
    api.saveScene.mockRejectedValueOnce(new Error('offline'));
    const wrapper = await open();
    await wrapper.get('textarea[aria-label="提示词"]').setValue('离线输入');
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    await wrapper.findAll('.scene-item')[1]?.trigger('click');
    await flushPromises();
    expect(wrapper.get('textarea[aria-label="提示词"]').element).toHaveProperty(
      'value',
      '离线输入',
    );
    const original = api.saveScene.mock.calls[0];
    await wrapper.find('[data-phase="error"] button').trigger('click');
    await flushPromises();
    expect(api.saveScene.mock.calls[1]).toEqual(original);
    expect(wrapper.find('[data-phase="saved"]').exists()).toBe(true);
  });
  it('retains local 409 content until an explicit conflict choice is made', async () => {
    api.saveScene.mockRejectedValueOnce({ response: { status: 409 } });
    const wrapper = await open();
    await wrapper.get('textarea[aria-label="提示词"]').setValue('本地冲突内容');
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    expect(wrapper.find('[data-phase="conflict"]').exists()).toBe(true);
    api.getScene.mockResolvedValueOnce(
      detail('first', 5, {
        ...definition('first'),
        promptText: '其他用户的新内容',
      }),
    );
    await wrapper.find('[data-phase="conflict"] button').trigger('click');
    await flushPromises();
    expect(wrapper.get('.conflict pre').text()).toBe('其他用户的新内容');
    expect(api.saveScene).toHaveBeenCalledTimes(1);
    await wrapper.findAll('.conflict button')[1]?.trigger('click');
    await flushPromises();
    expect(api.saveScene.mock.calls[1]?.[1]).toMatchObject({
      expectedRevision: 5,
      definition: { promptText: '本地冲突内容' },
    });
  });
  it('does not overwrite newer textarea edits with a late save response', async () => {
    let acknowledge: ((value: SceneSaveResult) => void) | undefined;
    api.saveScene.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          acknowledge = resolve;
        }),
    );
    const wrapper = await open();
    await wrapper.get('textarea[aria-label="提示词"]').setValue('在途内容');
    await vi.advanceTimersByTimeAsync(600);
    await wrapper.get('textarea[aria-label="提示词"]').setValue('更新内容');
    const [key, input] = api.saveScene.mock.calls[0] ?? [];
    acknowledge?.(response(key, input));
    await flushPromises();
    expect(wrapper.get('textarea[aria-label="提示词"]').element).toHaveProperty(
      'value',
      '更新内容',
    );
    expect(wrapper.find('[data-phase="saved"]').exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();
    expect(api.saveScene.mock.calls[1]?.[1].expectedRevision).toBe(2);
  });
  it('enforces readonly editing while preserving independent enable permission', async () => {
    access.accessCodes = ['ai:scene:list', 'ai:scene:query', 'ai:scene:enable'];
    api.setSceneEnabled.mockImplementation(async (key, input) => ({
      ...response(key, { ...input, definition: definition(key) }),
      detail: {
        ...detail(key, 2),
        scene: { ...detail(key, 2).scene, enabled: false },
      },
    }));
    const wrapper = await open();
    expect(
      wrapper.get('textarea[aria-label="提示词"]').attributes('readonly'),
    ).toBeDefined();
    await wrapper.get('header > button').trigger('click');
    await flushPromises();
    expect(api.setSceneEnabled).toHaveBeenCalledOnce();
    expect(api.saveScene).not.toHaveBeenCalled();
    expect(wrapper.get('header > button').text()).toBe('启用场景');
  });
});
