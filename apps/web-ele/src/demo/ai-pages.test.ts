import type { RequestResponse } from '@vben/request';

import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ConfigPage from '../views/system/ai-config/index.vue';
import RequestPage from '../views/system/ai-request/index.vue';
import ScenePage from '../views/system/ai-template/index.vue';
import TemplatePage from '../views/system/ai-template/LegacyWorkspace.vue';
import { DEMO_LOGIN, DEMO_PERMISSIONS } from './seed';
import { createDemoTransport } from './transport';

const client = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  request: vi.fn(),
}));
const permissions = vi.hoisted(() => ({ codes: new Array<string>() }));
vi.mock('#/api/request', () => ({ requestClient: client }));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<div><slot /></div>' },
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({
    accessCodes: permissions.codes,
    accessToken: 'fictional-local-session',
  }),
}));
vi.mock('@vben/hooks', () => ({
  useAppConfig: () => ({ apiURL: '/__static_demo_local_only__' }),
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}));

const wrappers: ReturnType<typeof mount>[] = [];
beforeEach(async () => {
  permissions.codes = [...DEMO_PERMISSIONS];
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
  if (!button) throw new Error(`Missing actual page button ${text}`);
  button.click();
}
describe('real AI pages with read-only local transport', () => {
  it('keeps template and resource fields and collection actions read-only without hiding details', async () => {
    const read = client.get.getMockImplementation();
    if (!read) throw new Error('Missing local transport');
    client.get.mockImplementation(
      async (url: string, options?: { params?: Record<string, unknown> }) => {
        const result = await read(url, options);
        // Optional binding exposes the child disabled=false override in the original form.
        return /^\/system\/ai\/templates\/\d+$/.test(url)
          ? {
              ...result,
              definition: {
                ...result.definition,
                resources: result.definition.resources.map(
                  (binding: { required: boolean }) => ({
                    ...binding,
                    required: false,
                  }),
                ),
              },
            }
          : result;
      },
    );
    for (const kind of ['templates', 'data-resources']) {
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
      if (kind === 'data-resources') {
        const tab = [...document.querySelectorAll('[role="tab"]')].find((el) =>
          el.textContent?.includes('数据引用'),
        );
        if (!(tab instanceof HTMLElement))
          throw new Error('Missing resource tab');
        tab.click();
        await settle();
      }
      openButton('查看 / 编辑');
      await settle();
      const dialog = document.querySelector('.el-dialog');
      const form = dialog?.querySelector('form');
      if (
        !(dialog instanceof HTMLElement) ||
        !(form instanceof HTMLFormElement)
      )
        throw new Error('Missing detail editor');
      const snapshot = () =>
        [...form.querySelectorAll('input, textarea')].map((field) => {
          if (
            !(field instanceof HTMLInputElement) &&
            !(field instanceof HTMLTextAreaElement)
          )
            throw new Error('Unexpected editor field');
          return {
            value: field.value,
            checked: field instanceof HTMLInputElement ? field.checked : false,
          };
        });
      const fields = [...form.querySelectorAll('input, textarea')];
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        if (
          !(field instanceof HTMLInputElement) &&
          !(field instanceof HTMLTextAreaElement)
        )
          throw new Error('Unexpected editor field');
        expect(field.disabled).toBe(true);
      }
      const buttons = [...form.querySelectorAll('button')];
      if (kind === 'templates') {
        expect(
          buttons.some((button) => button.textContent?.trim() === '添加变量'),
        ).toBe(true);
        expect(
          buttons.some(
            (button) => button.textContent?.trim() === '添加数据引用',
          ),
        ).toBe(true);
        expect(
          buttons.some((button) => button.textContent?.trim() === '移除'),
        ).toBe(true);
      }
      const before = snapshot();
      for (const button of buttons) {
        expect(button.disabled).toBe(true);
        button.click();
      }
      for (const checkbox of form.querySelectorAll('input[type="checkbox"]'))
        if (checkbox instanceof HTMLInputElement) checkbox.click();
      await settle();
      expect(snapshot()).toEqual(before);
      expect(dialog.textContent).not.toContain('保存草稿');
      expect(errors).toEqual([]);
      expect(client.post).not.toHaveBeenCalled();
      expect(client.put).not.toHaveBeenCalled();
      expect(client.request).not.toHaveBeenCalled();
      wrapper.unmount();
      wrappers.splice(wrappers.indexOf(wrapper), 1);
      document.body.innerHTML = '';
    }
  });
  it('shows named key associations in a locked viewer and keeps editing separate from enable permission', async () => {
    const viewer = mount(ConfigPage, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(viewer);
    await settle();
    openButton('供应商');
    await settle();
    openButton('查看 Key');
    await settle();
    const key = document.querySelector<HTMLInputElement>(
      'input[aria-label="Key 1 密钥"]',
    );
    expect(key?.disabled).toBe(true);
    expect(key?.value).toBe('');
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="Key 1 名称"]')
        ?.value,
    ).toBe('主账号示例');
    expect(
      document.querySelector<HTMLInputElement>('input[aria-label="Key 2 名称"]')
        ?.value,
    ).toBe('备用账号示例');
    expect(document.body.textContent).not.toContain('保存渠道');
    expect(document.body.textContent).not.toContain('启用已验证项');
    expect(client.post).not.toHaveBeenCalled();
    expect(client.put).not.toHaveBeenCalled();
  });
  it.each([
    ['configuration', ConfigPage, '查看', '/system/ai/settings/'],
    ['scene', ScenePage, '[虚构只读] 记录摘要场景', '/system/ai/scenes/'],
    ['template', TemplatePage, '查看 / 编辑', '/system/ai/templates/'],
    [
      'conversation',
      RequestPage,
      '[虚构只读] 订单分析对话',
      '/ai/conversations/',
    ],
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
        switch (_name) {
          case 'configuration': {
            const model = wrapper
              .findAll('.hub-list-item')
              .find((item) => item.text().includes('[虚构只读] 演示业务模型'));
            if (!model) throw new Error('Missing fictional business model');
            await model.trigger('click');

            break;
          }
          case 'conversation': {
            await wrapper.get('.conversation-item').trigger('click');
            break;
          }
          case 'scene': {
            await wrapper.get('.scene-item').trigger('click');
            break;
          }
          default: {
            if (button) openButton(button);
          }
        }
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
