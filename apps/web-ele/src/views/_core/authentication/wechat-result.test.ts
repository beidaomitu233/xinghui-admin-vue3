import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  bindWechatFlow,
  completeWechatFlow,
  getWechatFlow,
} from '#/api/system/wechat';

import ResultPage from './wechat-result.vue';

const state = vi.hoisted(() => ({
  replace: vi.fn(),
  token: '',
  fetch: vi.fn(),
  reset: vi.fn(),
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: state.replace }),
}));
vi.mock('@vben/stores', () => ({
  resetAllStores: () => state.reset(),
  useAccessStore: () => ({
    get accessToken() {
      return state.token;
    },
    setAccessToken: (value: string) => {
      state.token = value;
    },
  }),
  useUserStore: () => ({ userInfo: { realName: 'fixture' } }),
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({ fetchUserInfo: state.fetch }),
}));
vi.mock('#/api/system/wechat', () => ({
  WECHAT_FLOW_KEY: 'test.wechat.flow',
  getWechatFlow: vi.fn(),
  completeWechatFlow: vi.fn(),
  bindWechatFlow: vi.fn(),
  cancelWechatFlow: vi.fn(),
  safeWechatReturn: (value: string) => value,
}));
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem('test.wechat.flow', 'fixture-flow');
  state.token = '';
});
describe('微信结果与现有产品账号', () => {
  it('已绑定身份自动完成登录并恢复原业务', async () => {
    vi.mocked(getWechatFlow).mockResolvedValue({
      status: 'READY_LOGIN',
      returnPath: '/lowcode/records?formId=42',
      expiresInSeconds: 100,
    });
    vi.mocked(completeWechatFlow).mockResolvedValue({
      accessToken: 'fixture-token',
      returnPath: '/lowcode/records?formId=42',
    });
    mount(ResultPage, { global: { stubs: { RouterLink: true } } });
    await flushPromises();
    expect(completeWechatFlow).toHaveBeenCalledOnce();
    expect(state.fetch).toHaveBeenCalledOnce();
    expect(state.replace).toHaveBeenCalledWith('/lowcode/records?formId=42');
    expect(sessionStorage.getItem('test.wechat.flow')).toBeNull();
  });
  it('未绑定身份不会自动关联产品账号', async () => {
    state.token = 'existing-fixture-token';
    vi.mocked(getWechatFlow).mockResolvedValue({
      status: 'READY_BIND',
      returnPath: '/workspace',
      expiresInSeconds: 100,
    });
    const wrapper = mount(ResultPage, {
      global: { stubs: { RouterLink: true } },
    });
    await flushPromises();
    expect(bindWechatFlow).not.toHaveBeenCalled();
    expect(completeWechatFlow).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('确认关联当前账号');
  });
});
