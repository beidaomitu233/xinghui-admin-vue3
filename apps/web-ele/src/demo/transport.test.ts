import type { RequestClientOptions, RequestResponse } from '@vben/request';

import { defaultResponseInterceptor, RequestClient } from '@vben/request';

import { describe, expect, it, vi } from 'vitest';

import { DEMO_LOGIN, DEMO_MENUS, DEMO_STORAGE_KEY } from './seed';
import { AI_DEMO_IDS } from './ai-readonly';
import {
  createDemoTransport,
  DEMO_TRANSPORT_MARKER,
  resetDemoData,
} from './transport';

function memory() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}
function fixture() {
  const storage = memory();
  let token = '';
  const call = async (
    url: string,
    method = 'GET',
    data?: unknown,
    params?: Record<string, unknown>,
  ) => {
    const response = await createDemoTransport(storage)({
      url,
      method,
      data: data === undefined ? undefined : JSON.stringify(data),
      params,
      headers: { Authorization: token },
    } as RequestResponse['config']);
    return response.data instanceof Blob ? response.data : response.data.data;
  };
  const login = async () => {
    token = await call('/user/login', 'POST', DEMO_LOGIN);
  };
  return { storage, call, login };
}
describe('public static demo contracts', () => {
  it('uses four real phase-one roots and keeps AI pages independent of generic capabilities', async () => {
    const f = fixture();
    await f.login();
    const menus = await f.call('/user/router');
    const ai = menus.find((menu: { path: string }) => menu.path === '/ai');
    expect(menus).toHaveLength(4);
    expect(
      ai.children.map((menu: { path: string; component: string }) => [
        menu.path,
        menu.component,
      ]),
    ).toEqual([
      ['/ai/configurations', 'system/ai-config/index'],
      ['/ai/applications', 'system/ai-application/index'],
      ['/ai/templates', 'system/ai-template/index'],
      ['/ai/requests', 'system/ai-request/index'],
    ]);
    expect(
      menus
        .find((menu: { path: string }) => menu.path === '/infra')
        .children.every(
          (menu: { path: string }) => !menu.path.startsWith('/ai/'),
        ),
    ).toBe(true);
    const info = await f.call('/user/info');
    expect(info.permissions).toEqual(
      expect.arrayContaining([
        'ai:config:query',
        'ai:application:query',
        'ai:template:query',
        'ai:data:query',
        'ai:request:query',
      ]),
    );
    expect(
      info.permissions.some((permission: string) =>
        /^ai:.*:(test|publish|approve|enable|edit|add|invoke|audit|export)$/.test(
          permission,
        ),
      ),
    ).toBe(false);
  });
  it('serves complete fictional AI list/detail/version/reference contracts without successful provider evidence', async () => {
    const f = fixture();
    await f.login();
    const ids = AI_DEMO_IDS;
    const configPage = await f.call('/system/ai/configurations');
    expect(configPage.records[0].usableKeyCount).toBe(0);
    const config = await f.call(`/system/ai/configurations/${ids.config}`);
    expect(config.draft.keys).toEqual([]);
    expect(config.activePairs).toEqual([]);
    expect(config.latestTestId).toBeNull();
    expect(
      (await f.call(`/system/ai/configurations/${ids.config}/versions`))[0]
        .activated,
    ).toBe(false);
    const apps = await f.call('/system/ai/applications');
    expect(apps.records).toHaveLength(1);
    const app = await f.call(`/system/ai/applications/${ids.app}`);
    expect(app.enabled).toBe(false);
    expect(app.publishedVersionId).toBeNull();
    expect(
      await f.call(`/system/ai/applications/${ids.app}/test-evidence`),
    ).toEqual([]);
    expect(await f.call(`/system/ai/applications/${ids.app}/versions`)).toEqual(
      [],
    );
    expect(await f.call('/system/ai/applications/options/models')).toEqual([]);
    expect(
      await f.call(`/system/ai/applications/${ids.app}/health`),
    ).toMatchObject({ state: 'DISABLED' });
    const templates = await f.call('/system/ai/templates');
    expect(templates.records[0].id).toBe(ids.template);
    const template = await f.call(`/system/ai/templates/${ids.template}`);
    expect(template.definition.messages).toHaveLength(3);
    expect(template.definition.resources[0]).toMatchObject({
      resourceId: ids.resource,
      resourceVersionId: '1',
      outputs: { subject: 'record_subject' },
    });
    const resource = await f.call(`/system/ai/data-resources/${ids.resource}`);
    expect(resource.definition.fields).toEqual(['subject']);
    expect(resource.enabled).toBe(false);
    expect(
      (await f.call(`/system/ai/templates/${ids.template}/versions/1`))
        .definition,
    ).toEqual(template.definition);
    expect(
      await f.call(`/system/ai/data-resources/${ids.resource}/checks`),
    ).toEqual([]);
    expect(
      (await f.call('/system/ai/templates/options')).records[0],
    ).toMatchObject({
      available: false,
      unavailableReasons: ['TEMPLATE_DISABLED', 'RESOURCE_DISABLED'],
    });
    expect(await f.call('/ai/applications/record-summary')).toBeNull();
    const logs = await f.call('/system/ai/requests');
    expect(logs.records[0].request).toMatchObject({
      status: 'FAILED',
      attemptCount: 0,
      outputStarted: false,
      inputTokens: null,
      outputTokens: null,
    });
    const detail = await f.call(`/system/ai/requests/${ids.request}`);
    expect(detail.attempts).toEqual([]);
    expect(detail.stages[0].outcome).toBe('REJECTED');
    expect(await f.call('/system/ai/requests/statistics')).toMatchObject({
      requests: 1,
      modelAttempts: 0,
      knownInputTokens: null,
      knownOutputTokens: null,
    });
    expect(
      (
        await f.call('/system/ai/requests', 'GET', undefined, {
          status: 'SUCCEEDED',
        })
      ).records,
    ).toEqual([]);
    expect(
      await f.call('/system/ai/requests/statistics', 'GET', undefined, {
        status: 'SUCCEEDED',
      }),
    ).toMatchObject({ requests: 0 });
  });
  it('rejects every AI action, audit and unknown read without network, persistent mutations or a fabricated success', async () => {
    const f = fixture();
    await f.login();
    const before = f.storage.getItem(DEMO_STORAGE_KEY);
    const network = vi.spyOn(globalThis, 'fetch');
    try {
      for (const [url, method] of [
        [`/system/ai/configurations/${AI_DEMO_IDS.config}/test-runs`, 'POST'],
        [`/system/ai/configurations/${AI_DEMO_IDS.config}/draft`, 'PUT'],
        [`/system/ai/applications/${AI_DEMO_IDS.app}/publish`, 'POST'],
        [`/system/ai/applications/${AI_DEMO_IDS.app}/test-requests`, 'POST'],
        [`/system/ai/applications/${AI_DEMO_IDS.app}/preview`, 'POST'],
        [`/system/ai/data-resources/${AI_DEMO_IDS.resource}/approval`, 'POST'],
        [`/system/ai/templates/${AI_DEMO_IDS.template}/publish`, 'POST'],
        [`/ai/applications/${AI_DEMO_IDS.app}/requests`, 'POST'],
      ])
        await expect(
          f.call(url!, method!, {
            apiKey: 'never-persist-this-fictional-input',
          }),
        ).rejects.toMatchObject({ response: { status: 501 } });
      await expect(
        f.call('/system/ai/requests', 'GET', undefined, { scope: 'AUDIT' }),
      ).rejects.toMatchObject({ response: { status: 403 } });
      await expect(f.call('/system/ai/requests/export')).rejects.toMatchObject({
        response: { status: 501 },
      });
      await expect(
        f.call('/system/ai/applications/9999'),
      ).rejects.toMatchObject({ response: { status: 404 } });
      const config = await f.call(
        `/system/ai/configurations/${AI_DEMO_IDS.config}`,
      );
      config.name = 'mutated';
      expect(
        (await f.call(`/system/ai/configurations/${AI_DEMO_IDS.config}`)).name,
      ).toContain('虚构');
      expect(network).not.toHaveBeenCalled();
      expect(f.storage.getItem(DEMO_STORAGE_KEY)).toBe(before);
    } finally {
      network.mockRestore();
    }
  });
  it('requires the fictional account, restores a local session on refresh and invalidates logout', async () => {
    const f = fixture();
    await expect(f.call('/user/info')).rejects.toMatchObject({
      response: { status: 401 },
    });
    await expect(
      f.call('/user/login', 'POST', {
        phone: DEMO_LOGIN.phone,
        password: 'wrong',
      }),
    ).rejects.toMatchObject({ response: { status: 401 } });
    await f.login();
    const info = await f.call('/user/info');
    expect(info.user.userId).toBe('9007199254740993001');
    expect(info.roles[0].roleKey).toBe('demo');
    expect(info.permissions).not.toContain('system:businessConfig:edit');
    expect(info.permissions).toEqual(
      expect.arrayContaining([
        'system:dict:type:add',
        'system:dict:type:edit',
        'system:dict:item:add',
        'system:dict:item:edit',
      ]),
    );
    const menus = await f.call('/user/router');
    expect(menus.map((m: { menuName: string }) => m.menuName)).toEqual([
      '系统管理',
      '通用能力',
      '运行维护',
      'AI管理',
    ]);
    await f.call('/user/logout', 'POST');
    await expect(f.call('/user/info')).rejects.toMatchObject({
      response: { status: 401 },
    });
  });
  it('returns each listed user unchanged in details and keeps the current admin separate', async () => {
    const f = fixture();
    await f.login();
    const list = await f.call('/system/user/list');
    expect(list.records).toHaveLength(2);
    for (const user of list.records) {
      expect(typeof user.userId).toBe('string');
      const detail = await f.call(`/system/user/${user.userId}`);
      expect(detail.user).toEqual(user);
      expect(detail.roleIds).toEqual(['8001']);
    }
    expect(list.records[1]).toMatchObject({
      userId: '9007199254740993002',
      username: 'fictional_reader',
      nickname: '虚构读者',
      mobile: '',
      email: 'reader@example.invalid',
    });
    await expect(
      f.call('/system/user/9007199254740993999'),
    ).rejects.toMatchObject({ response: { status: 404 } });
    const currentUser = await f.call('/user/info');
    expect(currentUser.user).toEqual(list.records[0]);
  });
  it('provides read contracts for every retained menu and no deleted modules', async () => {
    const f = fixture();
    await f.login();
    const reads = [
      '/system/user/list',
      '/system/role/list',
      '/system/menu/tree',
      '/system/dict/types',
      '/sysConfig/list',
      '/system/businessConfig/wechat',
      '/system/businessConfig/sms',
      '/system/businessConfig/oss',
      '/lowcode/forms',
      '/system/oss/list',
      '/system/ai/models',
      '/system/ai/prompts',
      '/system/notice/list',
      '/system/notification/templates',
      '/system/news',
      '/monitor/job/list',
      '/monitor/jobLog/list',
      '/monitor/operlog/list',
      '/notifications',
    ];
    for (const url of reads) expect(await f.call(url)).toBeTruthy();
    const pages = DEMO_MENUS.flatMap((m) => m.children ?? []);
    expect(pages).toHaveLength(20);
    expect(pages.map((m) => m.path)).toEqual(
      expect.arrayContaining([
        '/workspace',
        '/analytics',
        '/infra/file',
        '/infra/notice',
      ]),
    );
    expect(JSON.stringify(DEMO_MENUS)).not.toMatch(
      /site\/|download\/|example\/|system\/page/,
    );
    const newsPage = await f.call('/system/news');
    const notificationsPage = await f.call('/notifications');
    const formsPage = await f.call('/lowcode/forms');
    const modelsPage = await f.call('/system/ai/models');
    expect(newsPage.records[0].id).toBe('9007199254740993991');
    expect(notificationsPage.items).toHaveLength(1);
    expect(formsPage.total).toBe('1');
    expect(modelsPage.records[0].enabled).toBe(false);
  });
  it('persists dictionary changes while preserving immutable codes and disabled historical labels', async () => {
    const f = fixture();
    await f.login();
    const id = await f.call('/system/dict/types', 'POST', {
      code: 'demo_topic',
      name: '本地主题',
      enabled: true,
    });
    const itemId = await f.call(`/system/dict/types/${id}/items`, 'POST', {
      value: 'learn',
      label: '学习',
      sortOrder: 1,
      enabled: true,
    });
    expect(await f.call('/dict/demo_topic/options')).toEqual([
      { value: 'learn', label: '学习', sortOrder: 1 },
    ]);
    await expect(
      f.call(`/system/dict/types/${id}`, 'PUT', {
        code: 'changed',
        name: 'changed',
        enabled: true,
      }),
    ).rejects.toMatchObject({ response: { status: 400 } });
    await f.call(`/system/dict/items/${itemId}`, 'PUT', {
      label: '学习（停用）',
      sortOrder: 2,
      enabled: false,
    });
    expect(await f.call('/dict/demo_topic/options')).toEqual([]);
    expect(await f.call('/dict/demo_topic/labels/learn')).toMatchObject({
      label: '学习（停用）',
      known: true,
      enabled: false,
    });
    const items = await f.call(`/system/dict/types/${id}/items`);
    expect(items[0].value).toBe('learn');
  });
  it('publishes immutable form snapshots and persists local submissions/edit/delete with revision conflicts', async () => {
    const f = fixture();
    await f.login();
    const runtime = await f.call('/lowcode/forms/2001/runtime');
    expect(runtime.schema.fields).toHaveLength(7);
    await expect(
      f.call('/lowcode/forms/2001/records', 'POST', {
        schemaVersion: 1,
        data: {},
      }),
    ).rejects.toMatchObject({ response: { status: 400 } });
    const record = await f.call('/lowcode/forms/2001/records', 'POST', {
      schemaVersion: 1,
      data: {
        subject: '本地提交',
        quantity: 2,
        priority: 'normal',
        tags: [],
        confirmed: false,
      },
    });
    const loadedRecord = await f.call(
      `/lowcode/forms/2001/records/${record.id}`,
    );
    expect(loadedRecord.data.subject).toBe('本地提交');
    const edited = await f.call(
      `/lowcode/forms/2001/records/${record.id}`,
      'PUT',
      {
        revision: 0,
        schemaVersion: 1,
        data: { ...record.data, subject: '已编辑' },
      },
    );
    expect(edited.revision).toBe(1);
    await expect(
      f.call(`/lowcode/forms/2001/records/${record.id}`, 'PUT', {
        revision: 0,
        schemaVersion: 1,
        data: record.data,
      }),
    ).rejects.toMatchObject({ response: { status: 409 } });
    const form = await f.call('/lowcode/forms/2001');
    const next = await f.call('/lowcode/forms/2001', 'PUT', {
      ...form,
      name: '新名称',
      schema: {
        fields: form.schema.fields.map((field: object) => ({ ...field })),
      },
    });
    await f.call('/lowcode/forms/2001/publish', 'POST', {
      revision: next.revision,
    });
    await expect(
      f.call('/lowcode/forms/2001/records', 'POST', {
        schemaVersion: 1,
        data: record.data,
      }),
    ).rejects.toMatchObject({ response: { status: 409 } });
    const historicalRecord = await f.call(
      `/lowcode/forms/2001/records/${record.id}`,
    );
    expect(historicalRecord.schemaVersion).toBe(1);
    await f.call(
      `/lowcode/forms/2001/records/${record.id}`,
      'DELETE',
      undefined,
      { revision: 1 },
    );
    await expect(
      f.call(`/lowcode/forms/2001/records/${record.id}`),
    ).rejects.toMatchObject({ response: { status: 404 } });
  });
  it('creates a draft, publishes and deletes only a form without records', async () => {
    const f = fixture();
    await f.login();
    const source = await f.call('/lowcode/forms/2001');
    const id = await f.call('/lowcode/forms', 'POST', {
      ...source,
      formKey: 'new_demo',
      name: '新表单',
      status: 'draft',
    });
    await expect(f.call(`/lowcode/forms/${id}/runtime`)).rejects.toMatchObject({
      response: { status: 404 },
    });
    const published = await f.call(`/lowcode/forms/${id}/publish`, 'POST', {
      revision: 0,
    });
    expect(published.status).toBe('enabled');
    await f.call(`/lowcode/forms/${id}`, 'DELETE', undefined, {
      revision: published.revision,
    });
    await expect(f.call(`/lowcode/forms/${id}`)).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
  it('returns a real local Blob and persists notification read state and news CRUD', async () => {
    const f = fixture();
    await f.login();
    const blob = await f.call('/system/oss/download/9007199254740993881');
    expect(blob).toBeInstanceOf(Blob);
    expect(await blob.text()).toContain('静态演示文件');
    expect(await f.call('/notifications/unread-count')).toBe('1');
    await f.call('/notifications/1/read', 'PUT');
    expect(await f.call('/notifications/unread-count')).toBe('0');
    const id = await f.call('/system/news', 'POST', {
      title: '新资讯',
      content: '本地内容',
      status: '1',
    });
    await f.call(`/system/news/${id}`, 'PUT', {
      title: '修改标题',
      content: '本地修改',
      status: '0',
    });
    const news = await f.call(`/system/news/${id}`);
    expect(news.title).toBe('修改标题');
    await f.call(`/system/news/${id}`, 'DELETE');
    await expect(f.call(`/system/news/${id}`)).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
  it('fails closed on unknown/external/vendor/credential/bulk writes without saving credentials or issuing network calls', async () => {
    const f = fixture();
    await f.login();
    const before = f.storage.getItem(DEMO_STORAGE_KEY);
    const fetch = vi.spyOn(globalThis, 'fetch');
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    try {
      for (const [path, method] of [
        ['/unknown/api', 'POST'],
        ['/system/businessConfig/sms', 'PUT'],
        ['/system/ai/models/1/test', 'POST'],
        ['/system/ai/models/1/credential', 'PUT'],
        ['/auth/wechat/authorize', 'POST'],
        ['/monitor/job/4001/run', 'POST'],
        ['/system/user/import', 'POST'],
        ['/system/oss/upload', 'POST'],
        ['/system/role/assignMenus', 'POST'],
      ] as const) {
        await expect(
          f.call(path, method, { apiKey: 'synthetic-do-not-save' }),
        ).rejects.toMatchObject({ response: { status: 501 } });
      }
      await expect(
        f.call('https://example.invalid/user/info'),
      ).rejects.toMatchObject({ response: { status: 403 } });
      expect(f.storage.getItem(DEMO_STORAGE_KEY)).toBe(before);
      expect(fetch).not.toHaveBeenCalled();
      expect(xhr).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
      xhr.mockRestore();
    }
  });
  it('reports storage corruption/quota errors and resets only its named local dataset', async () => {
    const f = fixture();
    await f.login();
    f.storage.setItem('other-auth', 'untouched');
    f.storage.setItem(DEMO_STORAGE_KEY, '{broken');
    await expect(f.call('/user/info')).rejects.toMatchObject({
      response: { status: 503 },
    });
    resetDemoData(f.storage);
    expect(f.storage.getItem('other-auth')).toBe('untouched');
    await f.login();
    const spy = vi.spyOn(f.storage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    await expect(
      f.call('/system/dict/types', 'POST', {
        code: 'new_type',
        name: '新字典',
        enabled: true,
      }),
    ).rejects.toMatchObject({ response: { status: 507 } });
    spy.mockRestore();
    const types = await f.call('/system/dict/types');
    expect(types.some((t: { code: string }) => t.code === 'new_type')).toBe(
      false,
    );
  });
  it('integrates with the real request interceptor and raw/blob contract', async () => {
    const storage = memory();
    const options: RequestClientOptions = {
      adapter: (config) => createDemoTransport(storage)(config),
      responseReturn: 'data',
    };
    const client = new RequestClient(options);
    client.addResponseInterceptor(
      defaultResponseInterceptor({
        codeField: 'code',
        dataField: 'data',
        successCode: 200,
      }),
    );
    const token = await client.post<string>('/user/login', DEMO_LOGIN);
    client.addRequestInterceptor({
      fulfilled: (config) => {
        config.headers.Authorization = token;
        return config;
      },
    });
    const raw = await client.get<RequestResponse>('/user/info', {
      responseReturn: 'raw',
    });
    expect(raw.headers['x-xinghui-demo-transport']).toBe(DEMO_TRANSPORT_MARKER);
    const formPage = await client.get<{ total: string }>('/lowcode/forms');
    expect(formPage.total).toBe('1');
    const blob = await client.get<Blob>(
      '/system/oss/download/9007199254740993881',
      { responseType: 'blob', responseReturn: 'body' },
    );
    expect(blob).toBeInstanceOf(Blob);
    await expect(client.post('/system/ai/models/1/test')).rejects.toMatchObject(
      { code: 501 },
    );
  });
});
