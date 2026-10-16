import type { RequestClientOptions, RequestResponse } from '@vben/request';

import { defaultResponseInterceptor, RequestClient } from '@vben/request';

import { describe, expect, it, vi } from 'vitest';

import { DEMO_LOGIN, DEMO_MENUS, DEMO_STORAGE_KEY } from './seed';
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
    expect(pages).toHaveLength(18);
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
