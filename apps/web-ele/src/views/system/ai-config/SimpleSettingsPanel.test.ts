import type {
  DraftCatalogScan,
  ModelCatalogPage,
  SavedCatalogScan,
} from '#/api/system/ai-model-catalog';
import type {
  AiSettingsChange,
  AiSettingsPage,
  AiSettingsView,
  SettingsProvider,
  SettingsTestRun,
} from '#/api/system/ai-settings';

import { flushPromises, mount } from '@vue/test-utils';

import ElementPlus, {
  ElCheckbox,
  ElDrawer,
  ElMessageBox,
  ElOption,
  ElPagination,
  ElPopconfirm,
} from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  click,
  fill,
  selectControl,
  selectValue,
  settleDebounce,
} from '#/test-utils/element-controls';

import ChannelWorkspace from './ChannelWorkspace.vue';
import ChannelPage from './index.vue';

const access = vi.hoisted(() => ({
  accessCodes: [] as string[],
  accessToken: 'test-actor',
}));
const api = vi.hoisted(() => ({
  list: vi.fn<
    (params: {
      pageNum: number;
      pageSize: number;
      search?: string;
    }) => Promise<AiSettingsPage>
  >(),
  get: vi.fn<(id: string) => Promise<AiSettingsView>>(),
  providers: vi.fn<() => Promise<SettingsProvider[]>>(),
  create: vi.fn<(value: AiSettingsChange) => Promise<AiSettingsView>>(),
  update:
    vi.fn<(id: string, value: AiSettingsChange) => Promise<AiSettingsView>>(),
  test: vi.fn<(id: string, value: unknown) => Promise<SettingsTestRun>>(),
  poll: vi.fn(),
  legacy: vi.fn(),
  activate: vi.fn(),
  disable: vi.fn(),
  draftScan:
    vi.fn<
      (
        value: DraftCatalogScan,
        signal?: AbortSignal,
      ) => Promise<ModelCatalogPage>
    >(),
  savedScan:
    vi.fn<
      (
        value: SavedCatalogScan,
        signal?: AbortSignal,
      ) => Promise<ModelCatalogPage>
    >(),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => access }));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<main><slot /></main>' },
}));
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRoute: () => ({ query: {} }),
}));
vi.mock('#/api/request', () => ({
  requestClient: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));
vi.mock('#/api/system/ai-settings', () => ({
  listAiSettings: api.list,
  getAiSettings: api.get,
  settingsProviders: api.providers,
  createAiSettings: api.create,
  updateAiSettings: api.update,
  testAiSettings: api.test,
  getAiSettingsTest: api.poll,
}));
vi.mock('#/api/system/ai-configuration', () => ({
  getConfiguration: api.legacy,
  activateConfiguration: api.activate,
  disableConfiguration: api.disable,
}));
vi.mock('#/api/system/ai-model-catalog', async (original) => ({
  ...(await original<object>()),
  scanDraftModels: api.draftScan,
  scanSavedModels: api.savedScan,
}));

const modelA = { code: 'vendor/a', name: '模型甲' };
const modelB = { code: 'vendor/b', name: '模型乙' };
function channel(id = '101', name = '主渠道'): AiSettingsView {
  return {
    configId: id,
    revision: 7,
    name,
    provider: 'openrouter',
    endpointUrl: 'https://openrouter.ai/api/v1/chat/completions',
    keyConfigured: true,
    maskedKey: '已配置',
    models: [modelA, modelB],
    active: true,
    pendingChanges: false,
    connection: {
      status: 'SUCCEEDED',
      active: true,
      message: '可用',
      testId: '91',
      checkedAt: null,
    },
    keys: [
      {
        keyId: '111',
        name: '主账号',
        keyConfigured: true,
        maskedKey: '••••1111',
        modelCodes: [modelA.code, modelB.code],
        status: 'SUCCEEDED',
        message: '可用',
        models: [modelA, modelB].map((model) => ({
          code: model.code,
          status: 'SUCCEEDED',
          message: '可用',
        })),
      },
      {
        keyId: '112',
        name: '备用账号',
        keyConfigured: true,
        maskedKey: '••••2222',
        modelCodes: [modelA.code],
        status: 'SUCCEEDED',
        message: '可用',
        models: [{ code: modelA.code, status: 'SUCCEEDED', message: '可用' }],
      },
    ],
  };
}
function catalog(
  code = 'vendor/catalog-model',
  name = '目录模型',
  provider = 'openrouter',
  pageNum = 1,
  total = 1,
): ModelCatalogPage {
  return {
    records: [
      {
        code,
        name,
        contextLength: '262144',
        maxCompletionTokens: '32768',
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportedParameters: [],
      },
    ],
    total,
    pageNum,
    pageSize: 50,
    provider,
    source: provider === 'openrouter' ? 'USER_FILTERED' : 'PROVIDER_KEY',
    configId: null,
    keyId: null,
    revision: null,
    generationVerified: false,
    refreshedAt: '2026-10-18T01:00:00Z',
    scannedCount: total + 2,
    filteredCount: 2,
    filterReasons: { NON_TEXT_OUTPUT: 2 },
  };
}
const wrappers: ReturnType<typeof mount>[] = [];
function render(page = false) {
  const wrapper = mount(page ? ChannelPage : ChannelWorkspace, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
function optionNames(wrapper: ReturnType<typeof render>, label: string) {
  return selectControl(wrapper, label)
    .findAllComponents(ElOption)
    .map((option) => option.props('label'));
}
beforeEach(() => {
  vi.resetAllMocks();
  access.accessCodes = [
    'ai:config:list',
    'ai:config:query',
    'ai:config:add',
    'ai:config:edit',
    'ai:config:test',
    'ai:config:enable',
  ];
  const first = channel();
  const second = channel('102', '备用渠道');
  api.list.mockResolvedValue({
    records: [first, second],
    total: '2',
    pageNum: 1,
    pageSize: 20,
  });
  api.get.mockResolvedValue(first);
  api.providers.mockResolvedValue([
    {
      code: 'openrouter',
      name: 'OpenRouter',
      defaultEndpoint: first.endpointUrl,
      suggestedModels: [],
    },
    {
      code: 'deepseek',
      name: 'DeepSeek 官方',
      defaultEndpoint: 'https://api.deepseek.com/chat/completions',
      suggestedModels: [],
    },
  ]);
  api.update.mockImplementation(async (_id, body) => ({
    ...first,
    name: body.name,
    revision: 8,
    pendingChanges: true,
  }));
  api.create.mockResolvedValue({
    ...first,
    active: false,
    pendingChanges: false,
  });
  api.legacy.mockResolvedValue({
    id: '101',
    revision: 7,
    draft: { configVersion: '8' },
  });
  api.activate.mockResolvedValue({});
  api.disable.mockResolvedValue({});
  api.draftScan.mockResolvedValue(catalog());
  api.savedScan.mockResolvedValue(catalog());
  vi.spyOn(ElMessageBox, 'confirm').mockImplementation(
    vi.fn().mockResolvedValue('confirm'),
  );
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});
describe('independent multi-key channel management', () => {
  it('requires cost consent and reports partial per-key results without activating when enable permission is absent', async () => {
    access.accessCodes = access.accessCodes.filter(
      (code) => code !== 'ai:config:enable',
    );
    const first = channel();
    api.test.mockResolvedValueOnce({
      testId: '92',
      configId: '101',
      status: 'PARTIAL',
      active: true,
      message: '仅已通过组合可用',
      models: [],
      keys: [
        {
          ...first.keys[0],
          keyId: '111',
          name: '主账号',
          status: 'SUCCEEDED',
          message: '通过',
          models: [{ code: 'vendor/a', status: 'SUCCEEDED', message: '通过' }],
        },
        {
          ...first.keys[1],
          keyId: '112',
          name: '备用账号',
          status: 'FAILED',
          message: '认证失败',
          models: [{ code: 'vendor/a', status: 'FAILED', message: '认证失败' }],
        },
      ],
    });
    const wrapper = render();
    await flushPromises();
    await click('编辑');
    const testButton = [
      ...document.querySelectorAll<HTMLButtonElement>('button'),
    ].find((button) => button.textContent?.trim() === '测试连接');
    expect(testButton?.disabled).toBe(true);
    expect(api.test).not.toHaveBeenCalled();
    wrapper.getComponent(ElCheckbox).vm.$emit('update:modelValue', true);
    await flushPromises();
    await click('测试连接');
    expect(api.test).toHaveBeenCalledWith('101', {
      confirmedCosts: true,
      activateOnSuccess: false,
    });
    expect(document.body.textContent).toContain('仅已通过组合可用');
    expect(document.body.textContent).toContain('认证失败');
    expect(api.activate).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  });
  it('lets a second key explicitly reuse selected channel models without another scan or a fabricated verification', async () => {
    const wrapper = render();
    await flushPromises();
    await click('新增渠道');
    await fill('渠道名称', '多账号渠道');
    await fill('Key 1 密钥', 'fictional-first-key');
    const catalogModel = catalog().records[0];
    if (!catalogModel) throw new Error('Missing catalog fixture');
    api.draftScan.mockResolvedValueOnce({
      ...catalog(),
      records: [
        {
          ...catalogModel,
          code: 'vendor/shared-a',
          name: '共享模型甲',
        },
        {
          ...catalogModel,
          code: 'vendor/shared-b',
          name: '共享模型乙',
        },
      ],
    });
    await click('获取模型目录');
    await selectValue(wrapper, 'Key 1 模型', [
      'vendor/shared-a',
      'vendor/shared-b',
    ]);
    await click('添加 Key');
    await fill('Key 2 密钥', 'fictional-second-key');
    expect(selectControl(wrapper, 'Key 2 模型').props('modelValue')).toEqual(
      [],
    );
    expect(optionNames(wrapper, 'Key 2 模型')).toEqual(
      expect.arrayContaining(['共享模型甲', '共享模型乙']),
    );
    const remote = selectControl(wrapper, 'Key 2 模型').props('remoteMethod');
    if (!remote) throw new Error('Missing model search');
    remote('共享模型甲');
    expect(optionNames(wrapper, 'Key 2 模型')).toContain('共享模型甲');
    await selectValue(wrapper, 'Key 2 模型', ['vendor/shared-a']);
    await click('保存渠道');
    expect(api.create.mock.calls[0]?.[0].keys).toEqual([
      expect.objectContaining({
        modelCodes: ['vendor/shared-a', 'vendor/shared-b'],
      }),
      expect.objectContaining({ modelCodes: ['vendor/shared-a'] }),
    ]);
    expect(api.draftScan).toHaveBeenCalledTimes(1);
    expect(api.test).not.toHaveBeenCalled();
  });
  it('renders the independent entry with two simultaneously enabled channels and no monitor or nested cards', async () => {
    const wrapper = render(true);
    await flushPromises();
    expect(wrapper.findComponent(ChannelWorkspace).exists()).toBe(true);
    expect(wrapper.find('.conversation-board').exists()).toBe(false);
    expect(wrapper.findAll('.el-card')).toHaveLength(0);
    expect(wrapper.text()).toContain('主渠道');
    expect(wrapper.text()).toContain('备用渠道');
    expect(wrapper.text().match(/已启用/g)).toHaveLength(2);
    expect(wrapper.text()).toContain('可用 Key');
    expect(api.draftScan).not.toHaveBeenCalled();
    expect(api.test).not.toHaveBeenCalled();
  });
  it('saves all named keys and their model sets without rotating a first key or automatically testing', async () => {
    const wrapper = render();
    await flushPromises();
    await click('编辑');
    expect(
      document
        .querySelector('input[aria-label="Key 1 密钥"]')
        ?.getAttribute('type'),
    ).toBe('password');
    await fill('渠道名称', '改名渠道');
    await click('保存渠道');
    expect(api.update).toHaveBeenCalledWith(
      '101',
      expect.objectContaining({
        name: '改名渠道',
        expectedRevision: 7,
        clientMutationId: expect.any(String),
        keys: [
          {
            keyId: '111',
            name: '主账号',
            apiKey: null,
            modelCodes: ['vendor/a', 'vendor/b'],
          },
          {
            keyId: '112',
            name: '备用账号',
            apiKey: null,
            modelCodes: ['vendor/a'],
          },
        ],
      }),
    );
    expect(api.update.mock.calls[0]?.[1]).not.toHaveProperty('apiKey');
    expect(api.test).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('待测试');
    expect(wrapper.findAllComponents(ElDrawer)).toHaveLength(1);
  });
  it('allows entering a new key, scanning and selecting a real returned model before saving', async () => {
    const wrapper = render();
    await flushPromises();
    await click('新增渠道');
    await fill('渠道名称', '新渠道');
    await fill('Key 1 密钥', 'fictional-new-key');
    expect(optionNames(wrapper, 'Key 1 模型')).not.toContain(
      'NVIDIA Nemotron 3.5 Lightning',
    );
    await click('获取模型目录');
    expect(api.draftScan.mock.calls[0]?.[0]).toEqual({
      provider: 'openrouter',
      apiKey: 'fictional-new-key',
      search: undefined,
      pageNum: 1,
      pageSize: 50,
    });
    expect(api.create).not.toHaveBeenCalled();
    expect(api.test).not.toHaveBeenCalled();
    await selectValue(wrapper, 'Key 1 模型', ['vendor/catalog-model']);
    await click('保存渠道');
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        modelCodes: ['vendor/catalog-model'],
        keys: [
          expect.objectContaining({
            apiKey: 'fictional-new-key',
            modelCodes: ['vendor/catalog-model'],
          }),
        ],
      }),
    );
  });
  it('uses server channel search and resets a later page without granting technical log access', async () => {
    const wrapper = render();
    await flushPromises();
    wrapper.getComponent(ElPagination).vm.$emit('current-change', 2);
    await flushPromises();
    await fill('搜索渠道', '远端渠道');
    await settleDebounce();
    expect(api.list).toHaveBeenLastCalledWith({
      pageNum: 1,
      pageSize: 20,
      search: '远端渠道',
    });
    expect(api.test).not.toHaveBeenCalled();
  });
  it('scans existing keys separately, sends server model searches and preserves cross-page selections', async () => {
    const wrapper = render();
    await flushPromises();
    await click('编辑');
    api.savedScan.mockResolvedValueOnce(
      catalog('vendor/first', '主账号目录', 'openrouter', 1, 60),
    );
    const scans = [...document.querySelectorAll('button')].filter(
      (button) => button.textContent?.trim() === '获取模型目录',
    );
    if (!scans[0] || !scans[1]) throw new Error('Missing key scan buttons');
    scans[0].click();
    await flushPromises();
    await selectValue(wrapper, 'Key 1 模型', ['vendor/first']);
    api.savedScan.mockResolvedValueOnce(
      catalog('vendor/second-key', '备用账号目录'),
    );
    scans[1].click();
    await flushPromises();
    expect(api.savedScan.mock.calls[1]?.[0]).toMatchObject({
      configId: '101',
      keyId: '112',
      expectedRevision: 7,
    });
    expect(optionNames(wrapper, 'Key 1 模型')).not.toContain('备用账号目录');
    api.savedScan.mockResolvedValueOnce(
      catalog('vendor/page-two', '第二页目录', 'openrouter', 2, 60),
    );
    const control = selectControl(wrapper, 'Key 1 模型');
    await control.find('.el-select__wrapper').trigger('click');
    await flushPromises();
    await click('下一页');
    expect(api.savedScan.mock.calls.at(-1)?.[0]).toMatchObject({
      keyId: '111',
      pageNum: 2,
    });
    expect(control.props('modelValue')).toEqual(['vendor/first']);
    expect(optionNames(wrapper, 'Key 1 模型')).toContain('主账号目录');
    const remote = control.props('remoteMethod');
    if (!remote) throw new Error('Missing server model search');
    remote('第二页');
    await settleDebounce();
    expect(api.savedScan.mock.calls.at(-1)?.[0]).toMatchObject({
      keyId: '111',
      search: '第二页',
      pageNum: 1,
    });
  });
  it('drops a late scan after key material changes and does not claim a generation test passed', async () => {
    const delayed = deferred<ModelCatalogPage>();
    api.draftScan.mockReturnValueOnce(delayed.promise);
    const wrapper = render();
    await flushPromises();
    await click('新增渠道');
    await fill('Key 1 密钥', 'old-fake-key');
    await click('获取模型目录');
    await fill('Key 1 密钥', 'new-fake-key');
    delayed.resolve(catalog('vendor/old', '旧Key私有目录'));
    await flushPromises();
    expect(optionNames(wrapper, 'Key 1 模型')).not.toContain('旧Key私有目录');
    expect(api.test).not.toHaveBeenCalled();
    api.draftScan.mockResolvedValueOnce(catalog('vendor/new', '新Key目录'));
    await click('获取模型目录');
    expect(api.draftScan.mock.calls.at(-1)?.[0].apiKey).toBe('new-fake-key');
    expect(optionNames(wrapper, 'Key 1 模型')).toContain('新Key目录');
  });
  it('drops a provider-stale scan and clears the prior provider credential', async () => {
    const delayed = deferred<ModelCatalogPage>();
    api.draftScan.mockReturnValueOnce(delayed.promise);
    const wrapper = render();
    await flushPromises();
    await click('新增渠道');
    await fill('Key 1 密钥', 'provider-one-key');
    await click('获取模型目录');
    await selectValue(wrapper, '渠道服务商', 'deepseek');
    delayed.resolve(catalog('vendor/old-provider', '旧服务商目录'));
    await flushPromises();
    expect(
      (
        document.querySelector(
          'input[aria-label="Key 1 密钥"]',
        ) as HTMLInputElement
      ).value,
    ).toBe('');
    expect(optionNames(wrapper, 'Key 1 模型')).not.toContain('旧服务商目录');
    await fill('Key 1 密钥', 'provider-two-key');
    api.draftScan.mockResolvedValueOnce(
      catalog('deepseek-chat', 'DeepSeek Chat', 'deepseek'),
    );
    await click('获取模型目录');
    expect(api.draftScan.mock.calls.at(-1)?.[0].provider).toBe('deepseek');
  });
  it('retries an uncertain save with the original nonce and identical key body', async () => {
    api.update.mockRejectedValueOnce(new Error('unknown admission'));
    render();
    await flushPromises();
    await click('编辑');
    await fill('渠道名称', '待确认渠道');
    await click('保存渠道');
    const original = api.update.mock.calls[0]?.[1];
    expect(document.body.textContent).toContain('保存结果未确认');
    await click('重试原保存');
    expect(api.update.mock.calls[1]?.[1]).toEqual(original);
    expect(original?.clientMutationId).toMatch(/^[\da-f-]{36}$/i);
  });
  it('uses the same unsaved guard for footer and drawer close and clears secrets only on confirmed dismissal', async () => {
    const wrapper = render();
    await flushPromises();
    await click('编辑');
    await fill('Key 1 密钥', 'temporary-fictional-secret');
    vi.mocked(ElMessageBox.confirm).mockRejectedValueOnce('cancel');
    await click('关闭');
    expect(
      (
        document.querySelector(
          'input[aria-label="Key 1 密钥"]',
        ) as HTMLInputElement
      ).value,
    ).toBe('temporary-fictional-secret');
    const done = vi.fn();
    const beforeClose = wrapper.getComponent(ElDrawer).props('beforeClose');
    if (!beforeClose) throw new Error('Missing guarded drawer close');
    beforeClose(done);
    await flushPromises();
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(2);
    expect(done).toHaveBeenCalledOnce();
  });
  it('keeps existing configuration viewers and enable-only callers independent of edit permission', async () => {
    access.accessCodes = ['ai:config:list', 'ai:config:enable'];
    render();
    await flushPromises();
    expect(document.body.textContent).not.toContain('启用已验证项');
    expect(document.body.textContent).not.toContain('停用');
    await click('查看');
    expect(
      (
        document.querySelector(
          'input[aria-label="Key 1 密钥"]',
        ) as HTMLInputElement
      ).disabled,
    ).toBe(true);
    expect(document.body.textContent).not.toContain('保存渠道');
    expect(api.legacy).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  });
  it('removes a key only after explicit confirmation and never reuses its late catalog', async () => {
    const delayed = deferred<ModelCatalogPage>();
    api.savedScan.mockReturnValueOnce(delayed.promise);
    const wrapper = render();
    await flushPromises();
    await click('编辑');
    await click('获取模型目录');
    const confirms = wrapper.findAllComponents(ElPopconfirm);
    const removal = confirms.find((confirm) =>
      String(confirm.props('title')).includes('模型关联'),
    );
    if (!removal) throw new Error('Missing key removal confirmation');
    removal.vm.$emit('confirm', new MouseEvent('click'));
    await flushPromises();
    delayed.resolve(catalog('vendor/removed-key', '已移除Key目录'));
    await flushPromises();
    expect(optionNames(wrapper, 'Key 1 模型')).not.toContain('已移除Key目录');
    await click('保存渠道');
    expect(api.update.mock.calls[0]?.[1].keys).toEqual([
      expect.objectContaining({ keyId: '112' }),
    ]);
  });
});
