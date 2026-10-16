import type {
  BusinessConfig,
  BusinessSection,
} from '#/api/system/business-config';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getBusinessConfig,
  saveBusinessConfig,
} from '#/api/system/business-config';

import ConfigPage from './index.vue';

const access = vi.hoisted(() => ({ codes: [] as string[] }));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessCodes: access.codes }),
}));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<main><slot /></main>' },
}));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }));
vi.mock('#/api/system/business-config', () => ({
  getBusinessConfig: vi.fn(),
  saveBusinessConfig: vi.fn(),
}));
vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn(), success: vi.fn() },
  ElLoadingDirective: { mounted: () => {}, updated: () => {} },
  ElAlert: { name: 'ElAlert', render: () => null },
  ElButton: { name: 'ElButton', render: () => null },
  ElCheckbox: { name: 'ElCheckbox', render: () => null },
  ElEmpty: { name: 'ElEmpty', render: () => null },
  ElForm: { name: 'ElForm', render: () => null },
  ElFormItem: { name: 'ElFormItem', render: () => null },
  ElInput: { name: 'ElInput', render: () => null },
  ElSelect: { name: 'ElSelect', render: () => null },
  ElOption: { name: 'ElOption', render: () => null },
  ElSwitch: { name: 'ElSwitch', render: () => null },
}));
const Form = defineComponent({
  props: { disabled: Boolean },
  setup(props, { slots }) {
    return () =>
      h('form', [
        h('fieldset', { disabled: props.disabled }, slots.default?.()),
      ]);
  },
});
const Input = defineComponent({
  props: {
    modelValue: { type: String, default: '' },
    type: { type: String, default: 'text' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        value: props.modelValue,
        type: props.type,
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
      });
  },
});
function config(section: BusinessSection): BusinessConfig {
  const parameters: Record<BusinessSection, Record<string, string>> = {
    wechat: {
      credentialMode: 'ENV',
      clientId: '',
      callbackUri: '',
      secretEnvName: '',
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
function page() {
  return mount(ConfigPage, {
    global: {
      stubs: {
        ElForm: Form,
        ElFormItem: { template: '<div><slot /></div>' },
        ElInput: Input,
        ElButton: {
          props: ['disabled', 'nativeType'],
          template:
            '<button :disabled="disabled" :type="nativeType || \'button\'"><slot /></button>',
        },
        ElAlert: true,
        ElEmpty: true,
        ElCheckbox: true,
        ElSelect: true,
        ElOption: true,
        ElSwitch: true,
      },
      directives: { loading: {} },
    },
  });
}
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
    expect(wrapper.findAll('section')).toHaveLength(3);
    expect(
      wrapper
        .findAll('fieldset')
        .every((field) => field.attributes('disabled') !== undefined),
    ).toBe(true);
    const reload = wrapper
      .findAll('button')
      .find((button) => button.text() === '重新读取');
    if (!reload) throw new Error('Reload button missing');
    expect(reload.element.closest('fieldset')).toBeNull();
    await reload.trigger('click');
    await flushPromises();
    expect(getBusinessConfig).toHaveBeenCalledTimes(4);
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
    await oss.find('form').trigger('submit');
    await flushPromises();
    expect(saveBusinessConfig).toHaveBeenCalledTimes(1);
    expect(saveBusinessConfig).toHaveBeenCalledWith(
      'oss',
      expect.objectContaining({
        revision: 3,
        secrets: { secretKey: 'unit-edit-only' },
      }),
    );
    expect((secret.element as HTMLInputElement).value).toBe('unit-edit-only');
    expect(getBusinessConfig).toHaveBeenCalledTimes(3);
  });
});
