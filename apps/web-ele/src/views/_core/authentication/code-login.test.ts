import { flushPromises, mount } from '@vue/test-utils';

import ElementPlus from 'element-plus';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { initComponentAdapter } from '#/adapter/component';
import { initSetupVbenForm } from '#/adapter/form';
import {
  getCaptchaApi,
  getSmsLoginCapability,
  sendSmsLoginCode,
} from '#/api/core/auth';

import Login from './code-login.vue';

const auth = vi.hoisted(() => ({ authLogin: vi.fn(), loginLoading: false }));
vi.mock('#/store', () => ({ useAuthStore: () => auth }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('#/api/core/auth', () => ({
  getCaptchaApi: vi.fn(),
  getSmsLoginCapability: vi.fn(),
  sendSmsLoginCode: vi.fn(),
}));
vi.mock('./wechat-entry.vue', () => ({
  default: { template: '<aside>微信扫码登录</aside>' },
}));
beforeAll(async () => {
  await initComponentAdapter();
  initSetupVbenForm();
});
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(getCaptchaApi).mockResolvedValue({
    enabled: false,
    uuid: '',
    img: '',
  });
  vi.mocked(getSmsLoginCapability).mockResolvedValue({ available: true });
  vi.mocked(sendSmsLoginCode).mockResolvedValue({
    requestId: 'challenge-fixture',
    expiresInSeconds: 300,
    retryAfterSeconds: 60,
  });
});
function page() {
  return mount(Login, {
    global: {
      plugins: [ElementPlus],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  });
}
async function sendButton(wrapper: ReturnType<typeof page>) {
  // Native form fields are async components. Wait for the actual append slot,
  // instead of assuming one microtask renders every registered input.
  return await vi.waitFor(() => {
    const button = wrapper
      .findAll('button')
      .find((b) => b.text() === '获取验证码');
    if (!button) throw new Error('SMS code button missing');
    return button;
  });
}
describe('sms login with existing accounts', () => {
  it('keeps the entry visible but cannot send when configuration is unavailable', async () => {
    vi.mocked(getSmsLoginCapability).mockResolvedValue({ available: false });
    const wrapper = page();
    await flushPromises();
    expect(wrapper.text()).toContain('短信登录暂未配置');
    expect(
      wrapper.get('[aria-label="login"]').attributes('disabled'),
    ).toBeDefined();
    expect(sendSmsLoginCode).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('sends only after phone validation and binds the login code to that phone and challenge', async () => {
    const wrapper = page();
    await flushPromises();
    await wrapper.get('input[autocomplete="tel"]').setValue('18800000310');
    const send = await sendButton(wrapper);
    await send.trigger('click');
    await flushPromises();
    expect(sendSmsLoginCode).toHaveBeenCalledWith({ phone: '18800000310' });
    await wrapper.get('input[autocomplete="one-time-code"]').setValue('123456');
    await wrapper.get('[aria-label="login"]').trigger('click');
    await flushPromises();
    expect(auth.authLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '18800000310',
        smsRequestId: 'challenge-fixture',
        smsCode: '123456',
      }),
      undefined,
    );
    wrapper.unmount();
  });
  it('does not apply a previous phone challenge after the phone is edited', async () => {
    const wrapper = page();
    await flushPromises();
    await wrapper.get('input[autocomplete="tel"]').setValue('18800000310');
    const send = await sendButton(wrapper);
    await send.trigger('click');
    await flushPromises();
    await wrapper.get('input[autocomplete="tel"]').setValue('18800000311');
    await wrapper.get('input[autocomplete="one-time-code"]').setValue('123456');
    await wrapper.get('[aria-label="login"]').trigger('click');
    await flushPromises();
    expect(auth.authLogin).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
