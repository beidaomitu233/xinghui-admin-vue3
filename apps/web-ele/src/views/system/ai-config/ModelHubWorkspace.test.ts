import type { HubModel, HubModelChange } from '#/api/system/ai-model-hub';
import type { AiSettingsView } from '#/api/system/ai-settings';

import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

import ElementPlus, { ElMessageBox, ElSwitch } from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { click, fill, selectValue } from '#/test-utils/element-controls';

import ModelHubWorkspace from './ModelHubWorkspace.vue';

const rawAccess = vi.hoisted(() => ({
  accessToken: 'actor-a',
  accessCodes: [] as string[],
}));
const access = reactive(rawAccess);
const api = vi.hoisted(() => ({
  models: vi.fn(),
  summary: vi.fn(),
  model: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  enabled: vi.fn(),
  startTest: vi.fn(),
  cancelTest: vi.fn(),
  poll: vi.fn(),
  channels: vi.fn(),
  channel: vi.fn(),
  providers: vi.fn(),
  stored: vi.fn(),
  scan: vi.fn(),
  channelCreate: vi.fn(),
  channelUpdate: vi.fn(),
  channelTest: vi.fn(),
  channelPoll: vi.fn(),
  attach: vi.fn(),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => access }));
vi.mock('vue-router', () => ({ onBeforeRouteLeave: vi.fn() }));
vi.mock('#/api/request', () => ({
  requestClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock('#/api/system/ai-model-hub', () => ({
  listHubModels: api.models,
  getHubModelSummary: api.summary,
  getHubModel: api.model,
  createHubModel: api.create,
  updateHubModel: api.update,
  deleteHubModel: api.remove,
  setHubModelEnabled: api.enabled,
  startHubModelTest: api.startTest,
  cancelHubModelTest: api.cancelTest,
  getHubModelTest: api.poll,
}));
vi.mock('#/api/system/ai-settings', () => ({
  listAiSettings: api.channels,
  getAiSettings: api.channel,
  settingsProviders: api.providers,
  createAiSettings: api.channelCreate,
  updateAiSettings: api.channelUpdate,
  testAiSettings: api.channelTest,
  getAiSettingsTest: api.channelPoll,
}));
vi.mock('#/api/system/ai-model-catalog', async (original) => ({
  ...(await original<object>()),
  getStoredCatalog: api.stored,
  scanSavedModels: api.scan,
  attachModelCatalog: api.attach,
}));

function channel(id = '101', provider = 'openrouter'): AiSettingsView {
  return {
    configId: id,
    revision: 7,
    name: `渠道 ${id}`,
    provider,
    endpointUrl:
      provider === 'openrouter'
        ? 'https://openrouter.ai/api/v1/chat/completions'
        : 'https://api.openai.com/v1/chat/completions',
    active: true,
    keyConfigured: true,
    maskedKey: '••••demo',
    models: [{ code: `${provider}/upstream-a`, name: '上游模型甲' }],
    connection: {
      active: true,
      status: 'SUCCEEDED',
      checkedAt: null,
      message: '',
      testId: null,
    },
    keys: [
      {
        keyId: `key-${id}`,
        name: '主账号',
        keyConfigured: true,
        maskedKey: '••••demo',
        modelCodes: [`${provider}/upstream-a`],
        status: 'SUCCEEDED',
        message: '',
        models: [
          { code: `${provider}/upstream-a`, status: 'SUCCEEDED', message: '' },
        ],
      },
    ],
  };
}
function model(): HubModel {
  return {
    modelId: 'business-1',
    revision: 4,
    name: '客服业务模型',
    slug: 'customer-chat',
    capabilities: '对话',
    contextWindow: '128K',
    enabled: true,
    strategy: 'PRIORITY',
    fallback: true,
    updatedAt: '2026-10-18T01:00:00Z',
    routes: [
      {
        routeId: 'route-1',
        channelId: '101',
        upstreamModel: 'openrouter/upstream-a',
        enabled: true,
        health: {
          ready: true,
          reasons: [],
          providerCode: 'openrouter',
          channelName: '渠道 101',
        },
      },
      {
        routeId: 'route-2',
        channelId: '202',
        upstreamModel: 'openai/upstream-a',
        enabled: true,
        health: {
          ready: true,
          reasons: [],
          providerCode: 'openai',
          channelName: '渠道 202',
        },
      },
    ],
    health: {
      ready: true,
      readyRoutes: 2,
      distinctProviders: 2,
      multiProviderProtected: true,
      reasons: [],
    },
  };
}
const wrappers: ReturnType<typeof mount>[] = [];
async function render() {
  const wrapper = mount(ModelHubWorkspace, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
  });
  wrappers.push(wrapper);
  await flushPromises();
  await flushPromises();
  return wrapper;
}
async function chooseModel(wrapper: ReturnType<typeof mount>) {
  const entry = wrapper
    .findAll('.hub-list-item')
    .find((item) => item.text().includes('客服业务模型'));
  if (!entry) throw new Error('Missing business model entry');
  await entry.trigger('click');
  await flushPromises();
}
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
beforeEach(() => {
  vi.resetAllMocks();
  access.accessToken = 'actor-a';
  access.accessCodes = ['list', 'query', 'add', 'edit', 'enable', 'test'].map(
    (action) => `ai:config:${action}`,
  );
  api.models.mockResolvedValue({
    records: [model()],
    total: '1',
    pageNum: 1,
    pageSize: 20,
  });
  api.model.mockResolvedValue(model());
  api.summary.mockResolvedValue({
    totalModels: 1,
    enabledModels: 1,
    readyModels: 1,
    unconfiguredModels: 0,
    disabledModels: 0,
    multiProviderModels: 1,
    assuranceNeededModels: 0,
    modelLimit: 512,
    observedAt: '2026-10-18T01:00:00Z',
  });
  api.channels.mockResolvedValue({
    records: [channel(), channel('202', 'openai')],
    total: '2',
    pageNum: 1,
    pageSize: 20,
  });
  api.channel.mockImplementation(async (id) =>
    channel(id, id === '101' ? 'openrouter' : 'openai'),
  );
  api.providers.mockResolvedValue([
    {
      code: 'openrouter',
      name: 'OpenRouter',
      defaultEndpoint: channel().endpointUrl,
      suggestedModels: [],
    },
    {
      code: 'openai',
      name: 'OpenAI',
      defaultEndpoint: channel('202', 'openai').endpointUrl,
      suggestedModels: [],
    },
  ]);
  api.stored.mockImplementation(async (id) => ({
    configId: id,
    revision: 7,
    provider: 'openrouter',
    endpointUrl: channel().endpointUrl,
    state: 'NOT_FETCHED',
    sources: [],
    catalog: {
      configId: id,
      revision: 7,
      provider: 'openrouter',
      keyId: null,
      generationVerified: false,
      records: [],
      total: 0,
      pageNum: 1,
      pageSize: 20,
      refreshedAt: '',
      source: 'PROVIDER_KEY',
    },
  }));
  api.create.mockImplementation(async (body) => ({
    ...model(),
    ...body,
    modelId: 'business-new',
    revision: 1,
    routes: [],
    health: {
      ready: false,
      readyRoutes: 0,
      distinctProviders: 0,
      multiProviderProtected: false,
      reasons: [],
    },
  }));
  api.update.mockImplementation(async (_id, body) => ({
    ...model(),
    ...body,
    revision: 5,
    routes: body.routes.map((route: HubModelChange['routes'][number]) => ({
      ...route,
      health: model().routes.find((item) => item.routeId === route.routeId)
        ?.health ?? {
        ready: false,
        reasons: [],
        providerCode: null,
        channelName: null,
      },
    })),
  }));
  api.enabled.mockResolvedValue({ ...model(), enabled: false, revision: 5 });
  api.startTest.mockResolvedValue({
    requestId: 'request-1',
    status: 'RUNNING',
    errorCode: null,
    attemptCount: 0,
    deadline: '2099-01-01T00:00:00Z',
    attempts: [],
  });
  api.poll.mockResolvedValue({
    requestId: 'request-1',
    status: 'SUCCEEDED',
    errorCode: null,
    attemptCount: 2,
    deadline: '2099-01-01T00:00:00Z',
    attempts: [
      {
        number: 1,
        providerCode: 'openrouter',
        upstreamModel: 'openrouter/upstream-a',
        status: 'FAILED',
        errorCode: null,
        switchReason: 'FIRST',
        elapsedMs: null,
      },
      {
        number: 2,
        providerCode: 'openai',
        upstreamModel: 'openai/upstream-a',
        status: 'SUCCEEDED',
        errorCode: null,
        switchReason: 'FALLBACK_MODEL',
        elapsedMs: 250,
      },
    ],
  });
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

describe('model-centered AI configuration from the approved prototype', () => {
  it('cancels only the original accepted test and confirms the backend terminal state', async () => {
    const running = {
      requestId: 'request-1',
      status: 'RUNNING',
      errorCode: null,
      attemptCount: 0,
      deadline: '2099-01-01T00:00:00Z',
      attempts: [],
    };
    const cancelled = { ...running, status: 'CANCELLED' };
    api.poll.mockResolvedValueOnce(running).mockResolvedValue(cancelled);
    api.cancelTest.mockResolvedValue(cancelled);
    const wrapper = await render();
    await chooseModel(wrapper);
    await click('测试调用');
    await click('开始测试');
    await click('取消测试');
    expect(api.cancelTest).toHaveBeenCalledWith('business-1', 'request-1');
    expect(api.startTest).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('已取消');
  });
  it('keeps the saved call name readonly and preserves genuinely unknown metadata', async () => {
    api.model.mockResolvedValue({
      ...model(),
      capabilities: '',
      contextWindow: '',
    });
    const wrapper = await render();
    await chooseModel(wrapper);
    expect(wrapper.text().match(/未提供/g)).toHaveLength(2);
    await click('编辑模型');
    expect(
      document.querySelector<HTMLInputElement>(
        'input[aria-label="业务模型调用名称"]',
      )?.readOnly,
    ).toBe(true);
    expect(document.body.textContent).toContain('创建后保持稳定');
    await click('保存设置');
    expect(api.update.mock.calls[0]?.[1]).toMatchObject({
      slug: 'customer-chat',
      capabilities: '',
      contextWindow: '',
    });
  });
  it('rejects uppercase call names before submitting a new business model', async () => {
    await render();
    await click('添加模型');
    await fill('业务模型名称', '客服');
    await fill('业务模型调用名称', 'Customer-Chat');
    await click('创建模型');
    expect(api.create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('小写字母');
  });
  it('uses the server summary for global totals and retains every model beyond the first API page', async () => {
    const records = Array.from({ length: 21 }, (_, index) => ({
      ...model(),
      modelId: `model-${index}`,
      name: `业务模型${index}`,
      slug: `business-${index}`,
    }));
    api.models.mockImplementation(async ({ pageNum }) => ({
      records: records.slice((pageNum - 1) * 20, pageNum * 20),
      total: '21',
    }));
    api.summary.mockResolvedValue({
      totalModels: 21,
      enabledModels: 21,
      readyModels: 19,
      unconfiguredModels: 2,
      disabledModels: 0,
      multiProviderModels: 17,
      assuranceNeededModels: 4,
      modelLimit: 512,
      observedAt: '2026-10-18T01:00:00Z',
    });
    const wrapper = await render();
    expect(api.models).toHaveBeenCalledWith({ pageNum: 2, pageSize: 20 });
    expect(
      wrapper.get('.overview-metrics button:nth-child(1) strong').text(),
    ).toBe('19 / 21');
    expect(wrapper.findAll('.hub-list-item')).toHaveLength(22);
    expect(wrapper.find('.el-pagination').exists()).toBe(true);
  });
  it('rejects duplicate supplier bindings and adding a seventeenth route without sending a write', async () => {
    const wrapper = await render();
    await chooseModel(wrapper);
    await click('添加供应商');
    await selectValue(wrapper, '业务模型接入渠道', '101');
    await selectValue(wrapper, '供应商上游模型', 'openrouter/upstream-a');
    await click('保存配置');
    expect(api.update).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('相同渠道与上游模型');
    await click('取消');
    const first = model().routes[0];
    if (!first) throw new Error('Missing route fixture');
    api.model.mockResolvedValue({
      ...model(),
      routes: Array.from({ length: 16 }, (_, index) => ({
        ...first,
        routeId: `route-${index}`,
      })),
    });
    await chooseModel(wrapper);
    await click('添加供应商');
    expect(wrapper.text()).toContain('最多配置 16');
    expect(api.update).not.toHaveBeenCalled();
  });
  it('defaults to the model overview and uses server health without calling providers or creating bindings', async () => {
    const wrapper = await render();
    expect(wrapper.text()).toContain('模型汇总');
    expect(wrapper.find('.overview-models .overview-table').exists()).toBe(
      true,
    );
    expect(wrapper.find('.overview-models .el-empty').exists()).toBe(false);
    expect(wrapper.get('.hub-summary-item').attributes('aria-pressed')).toBe(
      'true',
    );
    expect(wrapper.text()).toContain('多供应商保障');
    expect(wrapper.findAll('.el-card')).toHaveLength(0);
    expect(api.scan).not.toHaveBeenCalled();
    expect(api.startTest).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
  });
  it('shows the actual overview empty state only when there are no models', async () => {
    api.models.mockResolvedValue({
      records: [],
      total: '0',
      pageNum: 1,
      pageSize: 20,
    });
    api.summary.mockResolvedValue({
      totalModels: 0,
      enabledModels: 0,
      readyModels: 0,
      unconfiguredModels: 0,
      disabledModels: 0,
      multiProviderModels: 0,
      assuranceNeededModels: 0,
      modelLimit: 512,
      observedAt: '2026-10-18T01:00:00Z',
    });
    const wrapper = await render();
    expect(wrapper.find('.overview-models .overview-table').exists()).toBe(
      false,
    );
    expect(wrapper.get('.overview-models .el-empty').text()).toContain(
      '还没有配置模型',
    );
    expect(wrapper.find('.overview-models .el-pagination').exists()).toBe(
      false,
    );
  });
  it('keeps unverified keys and unavailable models outside the ready metrics', async () => {
    const unknown = channel();
    unknown.keys = unknown.keys.map((key) => ({
      ...key,
      models: [],
      status: 'NOT_TESTED',
    }));
    api.channels.mockResolvedValue({ records: [unknown], total: '1' });
    api.models.mockResolvedValue({
      records: [
        {
          ...model(),
          health: {
            ready: false,
            readyRoutes: 0,
            distinctProviders: 0,
            multiProviderProtected: false,
            reasons: ['NOT_VERIFIED'],
          },
        },
      ],
      total: '1',
    });
    api.summary.mockResolvedValue({
      totalModels: 1,
      enabledModels: 1,
      readyModels: 0,
      unconfiguredModels: 1,
      disabledModels: 0,
      multiProviderModels: 0,
      assuranceNeededModels: 1,
      modelLimit: 512,
      observedAt: '2026-10-18T01:00:00Z',
    });
    const wrapper = await render();
    expect(
      wrapper.get('.overview-metrics button:nth-child(1) strong').text(),
    ).toBe('0 / 1');
    expect(
      wrapper.get('.overview-metrics button:nth-child(4) strong').text(),
    ).toBe('0 / 1');
    expect(wrapper.text()).toContain('模型等待接入');
  });
  it('switches the left sidebar to suppliers and places masked keys before endpoint and catalog with stored metadata only', async () => {
    const wrapper = await render();
    await click('供应商');
    await flushPromises();
    expect(api.stored).toHaveBeenCalledWith('101', {
      pageNum: 1,
      pageSize: 20,
    });
    expect(wrapper.text().indexOf('API Key')).toBeLessThan(
      wrapper.text().indexOf('API 地址'),
    );
    expect(wrapper.text()).toContain('••••demo');
    expect(api.scan).not.toHaveBeenCalled();
    expect(api.channelTest).not.toHaveBeenCalled();
  });
  it('creates an independent business name and call name without implicitly binding a supplier', async () => {
    await render();
    await click('添加模型');
    await fill('业务模型名称', '售后助手');
    await fill('业务模型调用名称', 'support-chat');
    await click('创建模型');
    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '售后助手',
        slug: 'support-chat',
        routes: [],
        strategy: 'PRIORITY',
        fallback: true,
        clientMutationId: expect.any(String),
      }),
    );
    expect(api.startTest).not.toHaveBeenCalled();
    expect(api.channelUpdate).not.toHaveBeenCalled();
  });
  it('reorders actual supplier routes using the shared model CAS without changing their ids or upstream names', async () => {
    const wrapper = await render();
    await chooseModel(wrapper);
    await wrapper
      .get('button[aria-label="下移第 1 个供应商"]')
      .trigger('click');
    await flushPromises();
    expect(api.update).toHaveBeenCalledWith(
      'business-1',
      expect.objectContaining({
        expectedRevision: 4,
        routes: [
          {
            routeId: 'route-2',
            channelId: '202',
            upstreamModel: 'openai/upstream-a',
            enabled: true,
          },
          {
            routeId: 'route-1',
            channelId: '101',
            upstreamModel: 'openrouter/upstream-a',
            enabled: true,
          },
        ],
      }),
    );
    expect(api.channelUpdate).not.toHaveBeenCalled();
  });
  it('saves an edited route and strategy against exact upstream models rather than display names', async () => {
    const wrapper = await render();
    await chooseModel(wrapper);
    await selectValue(wrapper, '业务模型调用策略', 'ROUND_ROBIN');
    await flushPromises();
    expect(api.update.mock.calls[0]?.[1]).toMatchObject({
      strategy: 'ROUND_ROBIN',
      expectedRevision: 4,
      routes: expect.arrayContaining([
        expect.objectContaining({ upstreamModel: 'openrouter/upstream-a' }),
      ]),
    });
  });
  it('retries an uncertain model save with the original nonce and frozen body', async () => {
    api.update.mockRejectedValueOnce(new Error('lost receipt'));
    const wrapper = await render();
    await chooseModel(wrapper);
    await click('编辑模型');
    await fill('业务模型名称', '改名业务模型');
    await click('保存设置');
    const original = api.update.mock.calls[0]?.[1];
    expect(document.body.textContent).toContain('重试原保存');
    await click('重试原保存');
    expect(api.update.mock.calls[1]?.[1]).toEqual(original);
    expect(api.create).not.toHaveBeenCalled();
  });
  it('keeps enable-only actions on the narrow enable endpoint without granting metadata edits', async () => {
    access.accessCodes = ['list', 'query', 'enable'].map(
      (action) => `ai:config:${action}`,
    );
    const wrapper = await render();
    await chooseModel(wrapper);
    expect(wrapper.text()).not.toContain('编辑模型');
    const control = wrapper
      .findAllComponents(ElSwitch)
      .find((item) => item.props('ariaLabel') === '启用业务模型');
    if (!control) throw new Error('Missing model enable switch');
    await control.vm.$emit('change', false);
    await flushPromises();
    expect(api.enabled).toHaveBeenCalledWith('business-1', {
      expectedRevision: 4,
      enabled: false,
      clientMutationId: expect.any(String),
    });
    expect(api.update).not.toHaveBeenCalled();
  });
  it('calls the real test only after the explicit start and displays actual failed and switched attempts', async () => {
    const wrapper = await render();
    await chooseModel(wrapper);
    await click('测试调用');
    expect(api.startTest).not.toHaveBeenCalled();
    await click('开始测试');
    expect(api.startTest).toHaveBeenCalledWith('business-1', {
      expectedRevision: 4,
      confirmedCosts: true,
      clientMutationId: expect.any(String),
    });
    expect(document.body.textContent).toContain('调用成功');
    expect(document.body.textContent).toContain('切换备用接入');
    expect(document.body.textContent).toContain('未记录');
    expect(api.scan).not.toHaveBeenCalled();
  });
  it('discards an old actor detail response and blocks a list-only viewer from reading model details', async () => {
    const pending = deferred<HubModel>();
    api.model.mockReturnValueOnce(pending.promise);
    const wrapper = await render();
    await chooseModel(wrapper);
    access.accessToken = 'actor-b';
    await flushPromises();
    pending.resolve({ ...model(), name: 'OLD_ACTOR_PRIVATE_MODEL' });
    await flushPromises();
    expect(wrapper.text()).not.toContain('OLD_ACTOR_PRIVATE_MODEL');
    api.model.mockClear();
    access.accessCodes = ['ai:config:list'];
    await flushPromises();
    await chooseModel(wrapper);
    expect(api.model).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('当前无模型详情读取权限');
  });
});
