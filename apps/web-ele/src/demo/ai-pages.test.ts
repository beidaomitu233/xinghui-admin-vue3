import type { RequestResponse } from '@vben/request';
import { flushPromises, mount } from '@vue/test-utils';
import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import ConfigPage from '../views/system/ai-config/index.vue';
import ApplicationPage from '../views/system/ai-application/index.vue';
import TemplatePage from '../views/system/ai-template/index.vue';
import RequestPage from '../views/system/ai-request/index.vue';
import { DEMO_LOGIN, DEMO_PERMISSIONS } from './seed';
import { createDemoTransport } from './transport';

const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  request: vi.fn(),
}));
vi.mock('#/api/request', () => ({ requestClient: client }));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<div><slot /></div>' },
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({
    accessCodes: DEMO_PERMISSIONS,
    accessToken: 'fictional-local-session',
  }),
}));
vi.mock('@vben/hooks', () => ({
  useAppConfig: () => ({ apiURL: '/__static_demo_local_only__' }),
}));

const wrappers: ReturnType<typeof mount>[] = [];
beforeEach(async () => {
  const values = new Map<string, string>();
  const transport = createDemoTransport({
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => {
      values.set(k, v);
    },
    removeItem: (k) => {
      values.delete(k);
    },
  });
  const login = await transport({
    url: '/user/login',
    method: 'POST',
    data: JSON.stringify(DEMO_LOGIN),
  } as RequestResponse['config']);
  const token: string = login.data.data;
  client.get.mockReset();
  client.post.mockReset();
  client.put.mockReset();
  client.request.mockReset();
  client.get.mockImplementation(
    async (url: string, options?: { params?: Record<string, unknown> }) => {
      const result = await transport({
        url,
        method: 'GET',
        params: options?.params,
        headers: { Authorization: token },
      } as RequestResponse['config']);
      return result.data.data;
    },
  );
});
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  document.body.innerHTML = '';
});
async function settle() {
  for (let n = 0; n < 5; n++) {
    await flushPromises();
    await nextTick();
  }
}
function openButton(text: string) {
  const button = [...document.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === text,
  );
  expect(button, `Missing actual page button ${text}`).toBeTruthy();
  button!.click();
}
describe('real AI pages with read-only local transport', () => {
  it.each([
    ['configuration', ConfigPage, '配置', '/system/ai/configurations/'],
    ['application', ApplicationPage, '配置 / 测试', '/system/ai/applications/'],
    ['template', TemplatePage, '查看 / 编辑', '/system/ai/templates/'],
    ['request logs', RequestPage, '详情', '/system/ai/requests/'],
  ] as const)(
    'opens %s list and detail without a write, network request or render failure',
    async (_name, component, button, detailPrefix) => {
      const errors: unknown[] = [];
      const network = vi.spyOn(globalThis, 'fetch');
      try {
        const wrapper = mount(component, {
          attachTo: document.body,
          global: {
            plugins: [ElementPlus],
            config: {
              errorHandler: (error) => {
                errors.push(error);
              },
            },
          },
        });
        wrappers.push(wrapper);
        await settle();
        expect(wrapper.text()).toContain('虚构');
        openButton(button);
        await settle();
        expect(
          client.get.mock.calls.some(([url]) =>
            String(url).startsWith(detailPrefix),
          ),
        ).toBe(true);
        expect(errors).toEqual([]);
        expect(document.body.textContent).not.toContain('undefined');
        expect(client.post).not.toHaveBeenCalled();
        expect(client.put).not.toHaveBeenCalled();
        expect(client.request).not.toHaveBeenCalled();
        expect(network).not.toHaveBeenCalled();
      } finally {
        network.mockRestore();
      }
    },
  );
  it('opens the actual resource tab and resource details without executing a resource read', async () => {
    const errors: unknown[] = [];
    const wrapper = mount(TemplatePage, {
      attachTo: document.body,
      global: {
        plugins: [ElementPlus],
        config: {
          errorHandler: (error) => {
            errors.push(error);
          },
        },
      },
    });
    wrappers.push(wrapper);
    await settle();
    const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
      el.textContent?.includes('数据引用'),
    );
    expect(tab).toBeTruthy();
    (tab as HTMLElement).click();
    await settle();
    openButton('查看 / 编辑');
    await settle();
    expect(
      client.get.mock.calls.some(([url]) =>
        String(url).startsWith('/system/ai/data-resources/'),
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    expect(client.post).not.toHaveBeenCalled();
  });
});
