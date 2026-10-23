import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

import ElementPlus, { ElMessageBox } from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FillPage from './index.vue';

const context = vi.hoisted(() => ({
  push: vi.fn(),
  expireSession: vi.fn(),
  route: {
    params: { token: 'a'.repeat(43) },
    fullPath: `/forms/fill/${'a'.repeat(43)}`,
  },
  accessToken: null as null | string,
}));
const route = reactive(context.route);
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push: context.push }),
}));
vi.mock('#/store/auth', () => ({ useAuthStore: () => context }));
vi.mock('@vben/hooks', () => ({ useAppConfig: () => ({ apiURL: '/api' }) }));
vi.mock('@vben/stores', () => ({ useAccessStore: () => context }));
const definition = {
  title: '报名填写',
  schemaVersion: 1,
  accessMode: 'public',
  fields: [
    {
      fieldKey: 'name',
      label: '姓名',
      type: 'text',
      required: true,
      defaultValue: null,
      options: [],
      help: '',
      maxLength: 100,
      min: null,
      max: null,
    },
  ],
};
const fetcher = vi.fn();
const wrappers: ReturnType<typeof mount>[] = [];
function response(data: unknown, status = 200, message = '') {
  return {
    ok: status === 200,
    status,
    json: async () => ({ code: status, message, data }),
  };
}
async function render() {
  const wrapper = mount(FillPage, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        Teleport: true,
      },
    },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  context.accessToken = null;
  fetcher.mockReset();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('standalone shared filling', () => {
  it('validates, sends only filling fields, saves once and shows no management/answer links', async () => {
    fetcher
      .mockResolvedValueOnce(response(definition))
      .mockResolvedValueOnce(
        response({ submitted: true, receipt: 'receipt-only' }),
      );
    const wrapper = await render();
    expect(wrapper.find('aside').exists()).toBe(false);
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('姓名为必填项');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await wrapper.get('input').setValue('填写者');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('提交成功');
    const options = fetcher.mock.calls[1]?.[1];
    const body = JSON.parse(options.body);
    expect(Object.keys(body).toSorted()).toEqual([
      'data',
      'requestKey',
      'schemaVersion',
    ]);
    expect(body.data).toEqual({ name: '填写者' });
    expect(body.requestKey).toMatch(/^[\w-]{16,80}$/u);
    expect(wrapper.find('input').exists()).toBe(false);
    expect(wrapper.find('a').exists()).toBe(false);
  });
  it('retains input and blocks another attempt when the server has revoked the old link', async () => {
    fetcher
      .mockResolvedValueOnce(response(definition))
      .mockResolvedValueOnce(response(null, 410, '表单暂不可填写'));
    const wrapper = await render();
    await wrapper.get('input').setValue('仍然保留');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('表单暂不可填写');
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe(
      '仍然保留',
    );
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('routes a login-only share to login with its original return URL', async () => {
    context.accessToken = 'expired-session-token';
    context.expireSession.mockImplementation(async () => {
      context.accessToken = null;
      await context.push({
        path: '/auth/login',
        query: { redirect: encodeURIComponent(route.fullPath) },
      });
    });
    fetcher.mockResolvedValueOnce(response(null, 401, '请登录后填写此表单'));
    const wrapper = await render();
    expect(context.accessToken).toBe('expired-session-token');
    expect(context.expireSession).not.toHaveBeenCalled();
    const button = wrapper
      .findAll('button')
      .find((item) => item.text() === '登录后填写');
    expect(button).toBeDefined();
    if (!button) throw new Error('Missing login button');
    await button.trigger('click');
    await flushPromises();
    expect(context.expireSession).toHaveBeenCalledWith(true);
    expect(context.accessToken).toBeNull();
    expect(context.push).toHaveBeenCalledWith({
      path: '/auth/login',
      query: { redirect: encodeURIComponent(route.fullPath) },
    });
    expect(wrapper.find('form').exists()).toBe(false);
  });
  it('reuses the same request key after a lost response without mutating the submitted data', async () => {
    fetcher
      .mockResolvedValueOnce(response(definition))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(
        response({ submitted: true, receipt: 'same-receipt' }),
      );
    const wrapper = await render();
    await wrapper.get('input').setValue('原填写');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('请求未完成，请稍后重试');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(JSON.parse(fetcher.mock.calls[1]?.[1].body)).toEqual(
      JSON.parse(fetcher.mock.calls[2]?.[1].body),
    );
    expect(wrapper.text()).toContain('提交成功');
  });
  it('starts a fresh request only after explicitly confirming replacement of a conflicting submission', async () => {
    vi.spyOn(ElMessageBox, 'confirm').mockResolvedValue(
      Object.assign('confirm' as const, {
        action: 'confirm' as const,
        value: '',
      }),
    );
    fetcher
      .mockResolvedValueOnce(response(definition))
      .mockResolvedValueOnce(
        response(null, 409, '此提交已完成，请勿重复更改提交内容'),
      )
      .mockResolvedValueOnce(response(definition))
      .mockResolvedValueOnce(
        response({ submitted: true, receipt: 'fresh-receipt' }),
      );
    const wrapper = await render();
    await wrapper.get('input').setValue('修改后的填写');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    const originalKey = JSON.parse(fetcher.mock.calls[1]?.[1].body).requestKey;
    const reloadButton = wrapper
      .findAll('button')
      .find((entry) => entry.text() === '重新读取表单');
    if (!reloadButton) throw new Error('Missing reload action');
    await reloadButton.trigger('click');
    await flushPromises();
    expect(ElMessageBox.confirm).toHaveBeenCalledTimes(1);
    await wrapper.get('input').setValue('新的填写');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(JSON.parse(fetcher.mock.calls[3]?.[1].body).requestKey).not.toBe(
      originalKey,
    );
    expect(wrapper.text()).toContain('提交成功');
  });
});
