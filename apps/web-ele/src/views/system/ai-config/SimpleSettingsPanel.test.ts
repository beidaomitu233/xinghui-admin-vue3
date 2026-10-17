import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import SimpleSettingsPanel from './SimpleSettingsPanel.vue';

const access = vi.hoisted(() => ({ accessCodes: [] as string[] }));
const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  providers: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  test: vi.fn(),
  poll: vi.fn(),
  legacy: vi.fn(),
  activate: vi.fn(),
  disable: vi.fn(),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => access }));
vi.mock('#/api/system/ai-settings', async (importOriginal) => ({
  ...(await importOriginal<object>()),
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
const view = {
  configId: 'c1',
  revision: 7,
  name: '日常问答',
  provider: 'openrouter',
  endpointUrl: 'https://openrouter.ai/api/v1/chat/completions',
  keyConfigured: true,
  maskedKey: '••••abcd',
  models: [
    { code: 'poolside/laguna-s-2.1:free', name: 'Poolside Laguna S 2.1' },
  ],
  active: true,
  connection: {
    status: 'SUCCEEDED',
    active: true,
    message: '连接通过',
    testId: 't1',
    checkedAt: null,
  },
  pendingChanges: false,
};
const click = async (wrapper: ReturnType<typeof mount>, text: string) => {
  const button = wrapper.findAll('button').find((item) => item.text() === text);
  expect(button).toBeTruthy();
  if (!button) throw new Error('BUTTON_MISSING');
  await button.trigger('click');
  await flushPromises();
};
beforeEach(() => {
  vi.clearAllMocks();
  access.accessCodes = [
    'ai:config:list',
    'ai:config:query',
    'ai:config:edit',
    'ai:config:test',
    'ai:config:enable',
  ];
  api.list.mockResolvedValue({
    records: [view],
    total: '1',
    pageNum: 1,
    pageSize: 20,
  });
  api.get.mockResolvedValue(view);
  api.providers.mockResolvedValue([
    {
      code: 'openrouter',
      name: 'OpenRouter',
      defaultEndpoint: view.endpointUrl,
      suggestedModels: view.models,
    },
  ]);
  api.update.mockResolvedValue({
    ...view,
    pendingChanges: true,
    connection: { ...view.connection, status: 'NOT_TESTED' },
  });
  api.legacy.mockResolvedValue({
    id: 'c1',
    revision: 8,
    draft: { configVersion: 'draft7' },
  });
  api.disable.mockResolvedValue({});
  api.activate.mockResolvedValue({});
});
describe('direct Key and model management', () => {
  it('keeps Key secret, address fixed, and saves without invoking a provider', async () => {
    const wrapper = mount(SimpleSettingsPanel);
    await flushPromises();
    expect(
      wrapper.get('input[type="url"]').attributes('readonly'),
    ).toBeDefined();
    expect(wrapper.get('input[aria-label="API Key"]').attributes('type')).toBe(
      'password',
    );
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(api.update).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ apiKey: null, expectedRevision: 7 }),
    );
    expect(api.test).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('修改待测试，当前仍使用原配置');
    wrapper.unmount();
  });
  it('requires explicit cost confirmation and preserves partial test reasons', async () => {
    api.test.mockResolvedValue({
      configId: 'c1',
      testId: 't2',
      status: 'PARTIAL',
      active: true,
      message: '保留原连接',
      models: [
        {
          code: 'poolside/laguna-s-2.1:free',
          status: 'FAILED',
          message: '模型暂不可用',
        },
      ],
    });
    const wrapper = mount(SimpleSettingsPanel);
    await flushPromises();
    await click(wrapper, '测试连接');
    expect(api.test).not.toHaveBeenCalled();
    await wrapper.get('.cost-confirmation input').setValue(true);
    await click(wrapper, '测试连接');
    expect(api.test).toHaveBeenCalledWith('c1', {
      confirmedCosts: true,
      activateOnSuccess: true,
    });
    expect(wrapper.text()).toContain('模型暂不可用');
    expect(wrapper.text()).toContain('原可用连接继续保留');
    wrapper.unmount();
  });
  it('allows enable-only users to activate available models and disable the current connection', async () => {
    access.accessCodes = [
      'ai:config:list',
      'ai:config:query',
      'ai:config:enable',
    ];
    const wrapper = mount(SimpleSettingsPanel);
    await flushPromises();
    await click(wrapper, '启用已验证连接');
    expect(api.activate).toHaveBeenCalledWith('c1', {
      configVersion: 'draft7',
      revision: 8,
      onlyAvailable: true,
    });
    await click(wrapper, '停用配置');
    expect(api.disable).toHaveBeenCalledWith('c1', 8);
    expect(api.update).not.toHaveBeenCalled();
    expect(api.test).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('clears pasted secrets when closing the panel', async () => {
    const wrapper = mount(SimpleSettingsPanel);
    await flushPromises();
    await wrapper
      .get('input[aria-label="API Key"]')
      .setValue('temporary-secret');
    await click(wrapper, '关闭');
    expect(
      (wrapper.get('input[aria-label="API Key"]').element as HTMLInputElement)
        .value,
    ).toBe('');
    expect(wrapper.emitted('close')).toHaveLength(1);
    wrapper.unmount();
  });
});
