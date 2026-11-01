import type {
  BusinessConfig,
  BusinessSection,
} from '#/api/system/business-config';

import { flushPromises, mount } from '@vue/test-utils';

import ElementPlus from 'element-plus';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { initComponentAdapter } from '#/adapter/component';
import { initSetupVbenForm } from '#/adapter/form';
import {
  getBusinessConfig,
  saveBusinessConfig,
} from '#/api/system/business-config';

import ConfigPage from './index.vue';

const access = vi.hoisted(() => ({ codes: [] as string[] }));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessCodes: access.codes }),
}));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }));
vi.mock('#/api/system/business-config', () => ({
  getBusinessConfig: vi.fn(),
  saveBusinessConfig: vi.fn(),
}));
function config(section: BusinessSection): BusinessConfig {
  const parameters: Record<BusinessSection, Record<string, string>> = {
    wechat: {
      credentialMode: 'ENV',
      clientId: '',
      callbackUri: '',
      secretEnvName: '',
    },
    wechatMp: { clientId: '', callbackUri: '', scope: 'snsapi_base' },
    mail: {
      provider: 'qq',
      host: 'smtp.qq.com',
      port: '465',
      security: 'SSL',
      user: '',
      from: '',
    },
    oss: {
      provider: 'minio',
      endpoint: 'http://localhost:19000',
      bucket: 'unit-bucket',
      basePath: 'cfg02/',
    },
    sms: {
      provider: 'alibaba',
      signature: '',
      templateId: '',
      region: 'cn-hangzhou',
      sdkAppId: '',
    },
  };
  return {
    section,
    enabled: false,
    revision: 3,
    updateTime: null,
    source: 'DATABASE',
    effectiveState: 'DISABLED',
    encryptionReady: true,
    parameters: parameters[section],
    secretsConfigured: {},
  };
}
const wrappers: ReturnType<typeof mount>[] = [];
function page() {
  const wrapper = mount(ConfigPage, { global: { plugins: [ElementPlus] } });
  wrappers.push(wrapper);
  return wrapper;
}
beforeAll(async () => {
  await initComponentAdapter();
  await initSetupVbenForm();
  // 表单 Input/Switch 等是 defineAsyncComponent，预热门模块避免首个用例冷加载未渲染。
  await Promise.all([
    import('element-plus/es/components/input/index'),
    import('element-plus/es/components/input/style/css'),
    import('element-plus/es/components/switch/index'),
    import('element-plus/es/components/switch/style/css'),
  ]);
});
afterEach(async () => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  await flushPromises();
});
describe('business configuration sections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    access.codes = [
      'system:businessConfig:query',
      'system:businessConfig:edit',
    ];
    vi.mocked(getBusinessConfig).mockImplementation(async (section) =>
      config(section),
    );
  });
  it('allows query-only reloads outside the disabled edit forms', async () => {
    access.codes = ['system:businessConfig:query'];
    const wrapper = page();
    await flushPromises();
    expect(wrapper.findAll('[id^="business-"]')).toHaveLength(5);
    expect(
      wrapper
        .findAll('input:not([type=hidden])')
        .every((field) => (field.element as HTMLInputElement).disabled),
    ).toBe(true);
    const reload = wrapper
      .findAll('button')
      .find((button) => button.text() === '重新加载');
    if (!reload) throw new Error('Reload button missing');
    expect(reload.element.closest('fieldset')).toBeNull();
    await reload.trigger('click');
    await flushPromises();
    expect(getBusinessConfig).toHaveBeenCalledTimes(6);
  });
  it('saves only OSS and preserves secret input when its save fails', async () => {
    vi.mocked(saveBusinessConfig).mockRejectedValueOnce(
      new Error('probe failed'),
    );
    const wrapper = page();
    await flushPromises();
    const oss = wrapper.find('#business-oss');
    const secrets = oss.findAll('input[type="password"]');
    const secret = secrets.at(-1);
    if (!secret) throw new Error('Secret input missing');
    await secret.setValue('unit-edit-only');
    await flushPromises();
    const save = oss
      .findAll('button')
      .find((button) => button.text() === '保存配置');
    if (!save) throw new Error('Save button missing');
    await save.trigger('click');
    await flushPromises();
    expect(saveBusinessConfig).toHaveBeenCalledTimes(1);
    expect(saveBusinessConfig).toHaveBeenCalledWith(
      'oss',
      expect.objectContaining({
        revision: 3,
        secrets: expect.objectContaining({ secretKey: 'unit-edit-only' }),
      }),
    );
    expect((secret.element as HTMLInputElement).value).toBe('unit-edit-only');
    expect(getBusinessConfig).toHaveBeenCalledTimes(5);
  });
});
