import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getWechatCapability,
  startWechatAuthorization,
} from '#/api/system/wechat';

import Entry from './wechat-entry.vue';

vi.mock('#/api/system/wechat', () => ({
  getWechatCapability: vi.fn(),
  startWechatAuthorization: vi.fn(),
  isWechatAuthorizationUrl: () => false,
}));
beforeEach(() => vi.resetAllMocks());
describe('微信授权入口', () => {
  it('关闭或能力失败时不提供可点击入口', async () => {
    vi.mocked(getWechatCapability).mockResolvedValue({
      enabled: false,
      available: false,
      reason: 'DISABLED',
    });
    const wrapper = mount(Entry);
    await flushPromises();
    expect(wrapper.find('button').exists()).toBe(false);
    wrapper.unmount();
    vi.mocked(getWechatCapability).mockRejectedValue(
      new Error('Test request failed'),
    );
    const failed = mount(Entry);
    await flushPromises();
    expect(failed.find('button').exists()).toBe(false);
  });
  it('发起期间禁止重复点击并且失败可重试', async () => {
    vi.mocked(getWechatCapability).mockResolvedValue({
      enabled: true,
      available: true,
      reason: 'AVAILABLE',
    });
    let reject!: (reason: Error) => void;
    vi.mocked(startWechatAuthorization).mockReturnValue(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    const wrapper = mount(Entry);
    await flushPromises();
    await wrapper.get('button').trigger('click');
    await wrapper.get('button').trigger('click');
    expect(startWechatAuthorization).toHaveBeenCalledTimes(1);
    expect(wrapper.get('button').attributes('disabled')).toBeDefined();
    reject(new Error('Test request failed'));
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toContain('手机号登录');
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined();
    expect(wrapper.text()).toContain('尚不支持微信账号登录');
  });
});
