import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import Profile from './personal-profile.vue';

const state = vi.hoisted(() => ({
  access: null as any,
  fetch: vi.fn(),
  clear: vi.fn(),
  meta: {} as Record<string, unknown>,
}));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<div><slot /></div>' },
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => state.access,
  useUserStore: () => ({ setUserInfo: state.clear }),
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({ fetchUserInfo: state.fetch }),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ meta: state.meta, fullPath: '/profile' }),
  useRouter: () => ({ replace: vi.fn() }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  state.access = reactive({
    accessToken: 'current',
    isAccessChecked: true,
    setAccessCodes: vi.fn(),
  });
  state.meta = {};
});
describe('read-only personal profile', () => {
  it('shows actual current fields and clear missing values without editing roles', async () => {
    state.fetch.mockResolvedValue({
      username: 'alice',
      nickname: '小林',
      mobile: '13900001111',
      email: '',
      roles: ['common'],
    });
    const page = mount(Profile);
    await flushPromises();
    expect(page.text()).toContain('alice');
    expect(page.text()).toContain('小林');
    expect(page.text()).toContain('13900001111');
    expect(page.text()).toContain('未设置');
    expect(page.text()).toContain('common');
    expect(page.find('input,select').exists()).toBe(false);
  });
  it('hides previous content on a failed refresh and allows retry', async () => {
    state.fetch
      .mockResolvedValueOnce({ username: 'alice', roles: [] })
      .mockRejectedValueOnce(new Error('Test request failed'))
      .mockResolvedValueOnce({ username: 'alice', roles: [] });
    const page = mount(Profile);
    await flushPromises();
    await page.get('button').trigger('click');
    await flushPromises();
    expect(page.text()).not.toContain('alice');
    expect(page.get('[role="alert"]').text()).toContain('重试');
    expect(state.clear).toHaveBeenCalledWith(null);
    await page.get('button').trigger('click');
    await flushPromises();
    expect(page.text()).toContain('alice');
  });
  it('does not render a pending identity after logout', async () => {
    let resolve!: (value: any) => void;
    state.fetch.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const page = mount(Profile);
    state.access.accessToken = null;
    await flushPromises();
    resolve({ username: 'old-user', roles: [] });
    await flushPromises();
    expect(page.text()).not.toContain('old-user');
  });
});
