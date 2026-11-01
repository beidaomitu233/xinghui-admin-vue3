import type { BusinessConfig } from '#/api/system/business-config';

import { flushPromises, mount } from '@vue/test-utils';

import ElementPlus from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { testBusinessConfig } from '#/api/system/business-config';

import BusinessTestPanel from './BusinessTestPanel.vue';

vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessCodes: [] }),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/system/businessConfig' }),
}));
vi.mock('#/api/system/business-config', () => ({
  testBusinessConfig: vi.fn(),
}));
vi.mock('#/api/system/file', () => ({
  downloadFile: vi.fn(),
  uploadFile: vi.fn(),
}));
vi.mock('#/api/system/wechat', () => ({
  cancelWechatFlow: vi.fn(),
  getWechatFlow: vi.fn(),
  isWechatLoginUrl: vi.fn(),
  startWechatLogin: vi.fn(),
}));
const config: BusinessConfig = {
  section: 'mail',
  enabled: true,
  parameters: { provider: 'qq' },
  secretsConfigured: { password: true },
  revision: 7,
  updateTime: null,
  source: 'DATABASE',
  effectiveState: 'ADAPTED_SEND_UNVERIFIED',
  encryptionReady: true,
};
function panel(dirty = false) {
  return mount(BusinessTestPanel, {
    props: { section: 'mail', config, dirty, editable: true },
    global: { plugins: [ElementPlus] },
  });
}
beforeEach(() => vi.resetAllMocks());
describe('saved business configuration tests', () => {
  it('blocks a send until the configuration is saved', async () => {
    const wrapper = panel(true);
    await wrapper.find('input').setValue('qa@example.invalid');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(testBusinessConfig).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('请先保存后测试');
    wrapper.unmount();
  });
  it('sends the reviewed revision and shows success only from the actual receipt', async () => {
    vi.mocked(testBusinessConfig).mockResolvedValue({
      status: 'ACCEPTED',
      message: '邮件服务器已受理，请在收件箱确认收件',
      requestId: 'unit-test',
      provider: 'qq',
      revision: 7,
      elapsedMs: 123,
    });
    const wrapper = panel();
    expect(wrapper.text()).not.toContain('已受理');
    await wrapper.find('input').setValue('qa@example.invalid');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(testBusinessConfig).toHaveBeenCalledWith(
      'mail',
      expect.objectContaining({ revision: 7, recipient: 'qa@example.invalid' }),
    );
    expect(wrapper.text()).toContain('邮件服务器已受理');
    expect(wrapper.text()).toContain('123 ms');
    wrapper.unmount();
  });
  it('keeps a provider failure visible without inventing a success receipt', async () => {
    vi.mocked(testBusinessConfig).mockRejectedValue(new Error('unavailable'));
    const wrapper = panel();
    await wrapper.find('input').setValue('qa@example.invalid');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('测试未完成');
    expect(wrapper.text()).not.toContain('已受理');
    wrapper.unmount();
  });
});
