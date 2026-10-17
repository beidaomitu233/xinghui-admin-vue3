import type { RequestResponse } from '@vben/request';

import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import ElementPlus from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ApplicationPage from '../views/system/ai-application/index.vue';
import ConfigPage from '../views/system/ai-config/index.vue';
import RequestPage from '../views/system/ai-request/index.vue';
import TemplatePage from '../views/system/ai-template/index.vue';
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
  it('locks configuration drafts for viewers while preserving editor and enable-only permissions', async () => {
    const read = client.get.getMockImplementation();
    if (!read) throw new Error('Missing local transport');
    client.get.mockImplementation(
      async (url: string, options?: { params?: Record<string, unknown> }) => {
        const result = await read(url, options);
        // Exercise an eligible checkbox: unsupported capabilities must not hide the permission bug.
        return url === '/system/ai/configurations'
          ? { ...result, jsonObjectModels: ['fictional/local-only'] }
          : result;
      },
    );
    const viewer = mount(ConfigPage, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(viewer);
    await settle();
    openButton('配置');
    await settle();
    const drawer = document.querySelector('.el-drawer');
    if (!(drawer instanceof HTMLElement))
      throw new Error('Missing configuration drawer');
    const add = [...drawer.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '添加一行',
    );
    const capability = drawer.querySelector('input[type="checkbox"]');
    const name = drawer.querySelector('input');
    if (
      !add ||
      !(capability instanceof HTMLInputElement) ||
      !(name instanceof HTMLInputElement)
    )
      throw new Error('Missing editor controls');
    const keyRows = () =>
      [...drawer.querySelectorAll('.el-form-item__label')].filter(
        (label) => label.textContent?.trim() === '标签',
      ).length;
    expect(add.disabled).toBe(true);
    expect(capability.disabled).toBe(true);
    expect(name.disabled).toBe(true);
    const before = keyRows();
    const checked = capability.checked;
    add.click();
    capability.click();
    await settle();
    expect(keyRows()).toBe(before);
    expect(capability.checked).toBe(checked);
    expect(
      [...drawer.querySelectorAll('input')].every((input) => input.disabled),
    ).toBe(true);
    expect(drawer.textContent).not.toContain('保存草稿');
    expect(drawer.textContent).not.toContain('测试并保存');
    expect(client.post).not.toHaveBeenCalled();
    expect(client.put).not.toHaveBeenCalled();
    viewer.unmount();
    wrappers.splice(wrappers.indexOf(viewer), 1);
    document.body.innerHTML = '';
    permissions.codes = [...DEMO_PERMISSIONS, 'ai:config:edit'];
    const editor = mount(ConfigPage, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(editor);
    await settle();
    openButton('配置');
    await settle();
    const editDrawer = document.querySelector('.el-drawer');
    if (!(editDrawer instanceof HTMLElement))
      throw new Error('Missing editable drawer');
    const editableAdd = [...editDrawer.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '添加一行',
    );
    const editableCapability = editDrawer.querySelector(
      'input[type="checkbox"]',
    );
    if (!editableAdd || !(editableCapability instanceof HTMLInputElement))
      throw new Error('Missing editable controls');
    expect(editableAdd.disabled).toBe(false);
    expect(editableCapability.disabled).toBe(false);
    editableAdd.click();
    editableCapability.click();
    await settle();
    expect(
      [...editDrawer.querySelectorAll('.el-form-item__label')].filter(
        (label) => label.textContent?.trim() === '标签',
      ),
    ).toHaveLength(1);
    expect(editableCapability.checked).toBe(true);
    expect(editDrawer.textContent).toContain('保存草稿');
    expect(client.post).not.toHaveBeenCalled();
    expect(client.put).not.toHaveBeenCalled();
    editor.unmount();
    wrappers.splice(wrappers.indexOf(editor), 1);
    document.body.innerHTML = '';
    permissions.codes = [...DEMO_PERMISSIONS, 'ai:config:enable'];
    const enabler = mount(ConfigPage, {
      attachTo: document.body,
      global: { plugins: [ElementPlus] },
    });
    wrappers.push(enabler);
    await settle();
    openButton('配置');
    await settle();
    const enableDrawer = document.querySelector('.el-drawer');
    if (!(enableDrawer instanceof HTMLElement))
      throw new Error('Missing enable-only drawer');
    const lockedAdd = [...enableDrawer.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '添加一行',
    );
    if (!lockedAdd) throw new Error('Missing locked add control');
    expect(lockedAdd.disabled).toBe(true);
    const enableButtons = [...enableDrawer.querySelectorAll('button')].filter(
      (button) => button.textContent?.includes('启用'),
    );
    expect(enableButtons).toHaveLength(2);
    expect(enableButtons.every((button) => !button.disabled)).toBe(true);
    expect(enableDrawer.textContent).not.toContain('保存草稿');
    expect(client.post).not.toHaveBeenCalled();
    expect(client.put).not.toHaveBeenCalled();
  });
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
