import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getWechatLoginCapability,
  isWechatLoginUrl,
  startWechatLogin,
} from '#/api/system/wechat';

import Entry from './wechat-entry.vue';

vi.mock('#/api/system/wechat', () => ({
  getWechatLoginCapability: vi.fn(),
  startWechatLogin: vi.fn(),
  isWechatLoginUrl: vi.fn(() => false),
  safeWechatReturn: () => '/',
  WECHAT_FLOW_KEY: 'test.wechat.flow',
  cancelWechatFlow: vi.fn(),
}));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }) }));
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
});
describe('微信授权入口', () => {
  it('关闭或能力失败时不提供可点击入口', async () => {
    vi.mocked(getWechatLoginCapability).mockResolvedValue({
      mp: false,
      website: false,
    });
    const wrapper = mount(Entry);
    await flushPromises();
    expect(wrapper.find('button').exists()).toBe(false);
    wrapper.unmount();
    vi.mocked(getWechatLoginCapability).mockRejectedValue(
      new Error('Test request failed'),
    );
    const failed = mount(Entry);
    await flushPromises();
    expect(failed.find('button').exists()).toBe(false);
  });
  it('发起期间禁止重复点击并且失败可重试', async () => {
    vi.mocked(getWechatLoginCapability).mockResolvedValue({
      mp: true,
      website: true,
    });
    let reject!: (reason: Error) => void;
    vi.mocked(startWechatLogin).mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const wrapper = mount(Entry);
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await wrapper.get('button').trigger('click');
    expect(startWechatLogin).toHaveBeenCalledTimes(1);
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    reject(new Error('Test request failed'));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('手机号登录');
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
    expect(wrapper.text()).toContain('微信扫码');
    wrapper.unmount();
  });
  it('keeps the password page open and embeds only the validated official QR flow', async () => {
    vi.mocked(getWechatLoginCapability).mockResolvedValue({
      mp: false,
      website: true,
    });
    vi.mocked(isWechatLoginUrl).mockReturnValue(true);
    vi.mocked(startWechatLogin).mockResolvedValue({
      flow: 'owned-flow',
      expiresInSeconds: 300,
      authorizationUrl:
        'https://open.weixin.qq.com/connect/qrconnect?appid=fixture&scope=snsapi_login&state=owned',
    });
    const wrapper = mount(Entry);
    await flushPromises();
    const src = wrapper.get('iframe').attributes('src');
    if (!src) throw new Error('Official QR frame missing');
    const url = new URL(src);
    expect(url.origin).toBe('https://open.weixin.qq.com');
    expect(url.searchParams.get('self_redirect')).toBe('false');
    expect(startWechatLogin).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('test.wechat.flow')).toBe('owned-flow');
    wrapper.unmount();
  });
  it('does not render a provider URL rejected by the existing allowlist', async () => {
    vi.mocked(getWechatLoginCapability).mockResolvedValue({
      mp: false,
      website: true,
    });
    vi.mocked(startWechatLogin).mockResolvedValue({
      flow: 'invalid-flow',
      expiresInSeconds: 300,
      authorizationUrl: 'https://invalid.example/qr',
    });
    const wrapper = mount(Entry);
    await flushPromises();
    expect(wrapper.find('iframe').exists()).toBe(false);
    expect(sessionStorage.getItem('test.wechat.flow')).toBeNull();
    wrapper.unmount();
  });
});
