import type { RequestResponse } from '@vben/request';

import type {
  FieldValue,
  FormDraft,
  FormRecord,
  Submission,
} from '../api/lowcode/forms';
import type { DemoState } from './seed';

import { dataError, schemaError } from '../views/lowcode/form-schema';
import {
  createDemoState,
  DEMO_IMAGE,
  DEMO_LOGIN,
  DEMO_MENUS,
  DEMO_PERMISSIONS,
  DEMO_STORAGE_KEY,
  DEMO_TIME,
} from './seed';

export type DemoStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;
type Row = Record<string, unknown>;
export const DEMO_TRANSPORT_MARKER = 'XINGHUI_STATIC_DEMO_LOCAL_ONLY_V1';
class DemoFailure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new DemoFailure(status, message);
};
const now = () => new Date().toISOString();
const rowId = (row: Row, field: string, value: string) =>
  String(row[field]) === value;
const found = <T>(value: T | undefined): T =>
  value ?? fail(404, '本地示例不存在或已删除');
const revision = (expected: unknown, actual: number) => {
  if (!Number.isInteger(expected) || expected !== actual)
    fail(409, '本地数据已变化，请重新读取后操作');
};
function bodyOf(value: unknown): Row {
  if (typeof value === 'string') {
    try {
      return bodyOf(JSON.parse(value));
    } catch (error) {
      if (error instanceof DemoFailure) throw error;
      return fail(400, '演示请求不是有效JSON');
    }
  }
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value))
    return fail(400, '演示请求格式不正确');
  return value as Row;
}
function text(value: unknown, max = 2000) {
  if (typeof value !== 'string' || value.length > max)
    return fail(400, `字段须为最多${max}字符的文本`);
  return value;
}
function page<T>(rows: T[], params: Row, stringTotal = false) {
  const pageNum = Math.max(1, Number(params.pageNum) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 10));
  return {
    records: rows.slice((pageNum - 1) * pageSize, pageNum * pageSize),
    total: stringTotal ? String(rows.length) : rows.length,
    pageNum,
    pageSize,
  };
}
function filtered<T extends object>(rows: T[], params: Row) {
  return rows.filter((row) =>
    Object.entries(params).every(([key, value]) => {
      if (
        value === '' ||
        value === undefined ||
        value === null ||
        !(key in row)
      )
        return true;
      const actual = (row as Row)[key];
      return [
        'businessType',
        'enabled',
        'noticeType',
        'published',
        'status',
      ].includes(key)
        ? String(actual) === String(value)
        : String(actual ?? '')
            .toLowerCase()
            .includes(String(value).toLowerCase());
    }),
  );
}
const DEMO_USER = {
  userId: '9007199254740993001',
  username: 'public_demo',
  nickname: '演示管理员',
  email: 'demo@example.invalid',
  mobile: DEMO_LOGIN.phone,
  avatar: DEMO_IMAGE,
  status: 1,
  createTime: DEMO_TIME,
};
const DEMO_USERS = [
  DEMO_USER,
  {
    ...DEMO_USER,
    userId: '9007199254740993002',
    username: 'fictional_reader',
    nickname: '虚构读者',
    mobile: '',
    email: 'reader@example.invalid',
  },
];
const DEMO_ROLE = {
  roleId: '8001',
  roleName: '演示浏览者',
  roleKey: 'demo',
  roleSort: 1,
  dataScope: '1',
  menuCheckStrictly: true,
  deptCheckStrictly: true,
  status: 1,
  remark: '仅当前浏览器数据，不代表真实管理员权限',
  createTime: DEMO_TIME,
};
const MODELS = [
  {
    id: 1,
    providerCode: 'demo',
    modelCode: 'fictional-local-model',
    endpointUrl: 'https://provider.example.invalid/not-connected',
    credentialEnvName: null,
    credentialMode: 'ENV',
    credentialConfigured: false,
    timeoutSeconds: 30,
    enabled: false,
    revision: 0,
    createTime: DEMO_TIME,
    updateTime: DEMO_TIME,
  },
];
const PROMPTS = [
  {
    id: 1,
    appKey: 'demo',
    sceneKey: 'welcome',
    draftModelId: 1,
    draftProviderCode: 'demo',
    draftModelCode: 'fictional-local-model',
    draftModelEnabled: false,
    publishedModelId: null,
    publishedProviderCode: null,
    publishedModelCode: null,
    publishedModelEnabled: false,
    published: false,
    draftRevision: 0,
    publishedRevision: null,
    enabled: false,
    revision: 0,
    draftPrompt: '你好，{{name}}。这里只展示本地草稿，不调用模型。',
    draftVariables: [
      {
        name: 'name',
        type: 'STRING',
        description: '虚构演示名称',
        sensitive: false,
        exampleValue: '访客',
      },
    ],
    publishedPrompt: null,
    publishedVariables: [],
    createTime: DEMO_TIME,
    updateTime: DEMO_TIME,
  },
];
const CONFIGS = [
  {
    configId: 1,
    configKey: 'demo.welcome',
    configName: '演示欢迎语（只读）',
    configValue: '欢迎体验静态后台',
    runtimeActive: false,
    deletable: false,
  },
];
const TEMPLATES = [
  {
    id: 1,
    eventCode: 'demo.welcome',
    name: '演示欢迎通知（只读）',
    titleTemplate: '你好，{{name}}',
    bodyTemplate: '此处仅展示模板，未执行真实投递。',
    targetTemplate: '/notifications',
    allowedVariables: ['name'],
    enabled: false,
  },
];
const FILE_TEXT = '星辉静态演示文件。纯虚构内容，无对象存储连接。\n';
const FILES = [
  {
    ossId: '9007199254740993881',
    originalName: '静态演示说明.txt',
    fileName: 'demo-readme.txt',
    fileSuffix: 'txt',
    size: String(new TextEncoder().encode(FILE_TEXT).length),
    createTime: DEMO_TIME,
  },
];
const JOBS = [
  {
    jobId: '4001',
    jobName: '演示任务（不会执行）',
    jobGroup: 'DEMO',
    handlerKey: 'demo.readonly',
    handlerParams: '{}',
    cronExpression: '0 0 9 * * ?',
    timeZone: 'Asia/Shanghai',
    nextFireTime: null,
    misfirePolicy: '3',
    concurrent: '1',
    status: '1',
    remark: '执行与状态变更已禁用',
    createBy: '演示',
    createTime: DEMO_TIME,
  },
];
const FIRES = [
  {
    fireId: '5001',
    jobId: '4001',
    jobName: JOBS[0]?.jobName,
    jobGroup: 'DEMO',
    triggerType: 'MANUAL',
    status: 'SKIPPED',
    attemptCount: 0,
    scheduledFireTime: null,
    startedAt: DEMO_TIME,
    completedAt: DEMO_TIME,
    resultSummary: '虚构日志：静态模式未调度任何任务',
    traceId: null,
  },
];
const OPERLOGS = [
  {
    operId: '6001',
    title: '静态演示示例日志',
    businessType: 0,
    method: 'demo.readonly',
    requestMethod: 'LOCAL',
    operatorType: 1,
    operName: '演示访客',
    deptName: '',
    operUrl: 'local-only',
    operIp: '',
    operLocation: '本浏览器',
    operParam: '{}',
    jsonResult: '{"demo":true}',
    status: 0,
    errorMsg: '',
    operTime: DEMO_TIME,
  },
];

export function resetDemoData(storage: DemoStorage) {
  storage.removeItem(DEMO_STORAGE_KEY);
}
function load(storage: DemoStorage): DemoState {
  const saved = storage.getItem(DEMO_STORAGE_KEY);
  if (!saved) return createDemoState();
  try {
    const state = JSON.parse(saved) as DemoState;
    if (
      state.version !== 1 ||
      !Array.isArray(state.types) ||
      !Array.isArray(state.forms) ||
      !Array.isArray(state.records) ||
      !Array.isArray(state.items) ||
      !Array.isArray(state.news) ||
      !Array.isArray(state.notifications)
    )
      throw new Error('Invalid state');
    return state;
  } catch {
    return fail(
      503,
      '演示数据损坏，请使用“重置示例数据”恢复；未删除其他浏览器数据',
    );
  }
}
function save(storage: DemoStorage, state: DemoState) {
  const serialized = JSON.stringify(state);
  if (new TextEncoder().encode(serialized).length > 2_000_000)
    fail(413, '本地演示数据超过2MB，请清理或重置示例数据');
  try {
    storage.setItem(DEMO_STORAGE_KEY, serialized);
  } catch {
    fail(507, '浏览器不允许保存或空间不足，操作未保存');
  }
}

export function createDemoTransport(storage: DemoStorage) {
  return async (
    config: RequestResponse['config'],
  ): Promise<RequestResponse> => {
    const response = (data: unknown, status = 200): RequestResponse => ({
      data,
      status,
      statusText: String(status),
      headers: {
        'x-xinghui-demo-transport': DEMO_TRANSPORT_MARKER,
        'content-type': data instanceof Blob ? data.type : 'application/json',
      },
      config,
    });
    try {
      const requestUrl = config.url ?? '';
      if (!requestUrl.startsWith('/') || requestUrl.startsWith('//'))
        fail(403, '静态演示禁止外部地址，不会发送网络请求');
      const url = new URL(requestUrl, 'https://static-demo.invalid');
      const path = decodeURIComponent(url.pathname).replace(/\/$/, '') || '/';
      const params: Row = {
        ...Object.fromEntries(url.searchParams),
        ...config.params,
      };
      const method = (config.method ?? 'GET').toUpperCase();
      const data = bodyOf(config.data);
      const state = load(storage);
      let changed = false;
      const id = () => String(++state.sequence);
      const result = (): unknown => {
        if (path === '/captcha' && method === 'GET')
          return { enabled: false, img: '', uuid: '' };
        if (path === '/auth/wechat/capability' && method === 'GET')
          return {
            enabled: false,
            available: false,
            reason: '静态演示不连接微信',
          };
        if (path === '/user/login' && method === 'POST') {
          if (
            data.phone !== DEMO_LOGIN.phone ||
            data.password !== DEMO_LOGIN.password
          )
            fail(401, '请使用公开虚构演示账号，勿输入真实凭据');
          state.session = `public-static-session-${id()}`;
          changed = true;
          return state.session;
        }
        const headers = config.headers;
        const authorization = headers?.Authorization ?? headers?.authorization;
        if (!state.session || authorization !== state.session)
          fail(401, '演示会话已失效，请使用演示入口重新进入');
        if (path === '/user/logout' && method === 'POST') {
          state.session = null;
          changed = true;
          return null;
        }
        if (path === '/user/info' && method === 'GET')
          return {
            user: DEMO_USER,
            roles: [DEMO_ROLE],
            permissions: DEMO_PERMISSIONS,
          };
        if (path === '/user/router' && method === 'GET') return DEMO_MENUS;
        if (method === 'GET') {
          if (path === '/system/user/list')
            return page(filtered(DEMO_USERS, params), params);
          if (/^\/system\/user\/\d+$/.test(path))
            return {
              user: found(
                DEMO_USERS.find(
                  (user) => user.userId === path.split('/').at(-1),
                ),
              ),
              roleIds: ['8001'],
            };
          if (path === '/system/role/list')
            return page(filtered([DEMO_ROLE], params), params);
          if (path === '/system/role/8001') return DEMO_ROLE;
          if (path === '/system/role/menuIds/8001')
            return DEMO_MENUS.flatMap((menu) => [
              menu.menuId,
              ...(menu.children ?? []).map((child) => child.menuId),
            ]);
          if (path === '/system/menu/tree' || path === '/system/menu/list')
            return DEMO_MENUS;
          if (/^\/system\/menu\/\d+$/.test(path))
            return found(
              DEMO_MENUS.flatMap((m) => [m, ...(m.children ?? [])]).find(
                (m) => m.menuId === path.split('/').at(-1),
              ),
            );
          if (path === '/sysConfig/list') return CONFIGS;
          if (path === '/sysConfig/1') return CONFIGS[0];
          if (/^\/system\/businessConfig\/(?:oss|sms|wechat)$/.test(path))
            return {
              section: path.split('/').at(-1),
              enabled: false,
              parameters: {},
              secretsConfigured: {},
              revision: 0,
              updateTime: null,
              source: '静态只读示例',
              effectiveState: 'DISABLED',
              encryptionReady: false,
            };
          if (path === '/system/ai/models')
            return page(filtered(MODELS, params), params, true);
          if (path === '/system/ai/models/1') return MODELS[0];
          if (path === '/system/ai/prompts')
            return page(filtered(PROMPTS, params), params, true);
          if (path === '/system/ai/prompts/models')
            return MODELS.map(({ id, modelCode, providerCode }) => ({
              id,
              modelCode,
              providerCode,
            }));
          if (path === '/system/ai/prompts/1') return PROMPTS[0];
          if (path === '/system/notification/templates') return TEMPLATES;
          if (path === '/system/oss/list')
            return page(filtered(FILES, params), params);
          if (path === `/system/oss/info/${FILES[0]?.ossId}`) return FILES[0];
          if (path === `/system/oss/download/${FILES[0]?.ossId}`)
            return new Blob([FILE_TEXT], { type: 'text/plain;charset=utf-8' });
          if (path === '/monitor/job/list')
            return page(filtered(JOBS, params), params, true);
          if (path === '/monitor/job/handlers') return ['demo.readonly'];
          if (path === '/monitor/job/4001') return JOBS[0];
          if (path === '/monitor/job/4001/fires') return FIRES;
          if (path === '/monitor/jobLog/list')
            return page(filtered(FIRES, params), params, true);
          if (path === '/monitor/jobLog/5001') return FIRES[0];
          if (path === '/monitor/operlog/list')
            return page(filtered(OPERLOGS, params), params, true);
        }
        if (path === '/system/dict/types') {
          if (method === 'GET') return state.types;
          if (method === 'POST') {
            const code = text(data.code, 100);
            const name = text(data.name, 100);
            if (
              !/^[a-z][a-z0-9_]*$/.test(code) ||
              !name.trim() ||
              state.types.some((t) => t.code === code)
            )
              fail(400, '字典编码格式不正确、名称为空或编码重复');
            const nextId = Number(id());
            state.types.push({
              id: nextId,
              code,
              name,
              enabled: data.enabled === true,
              remark: String(data.remark ?? ''),
              revision: 0,
            });
            changed = true;
            return nextId;
          }
        }
        let match = path.match(/^\/system\/dict\/types\/(\d+)(\/items)?$/);
        if (match) {
          const type = found(
            state.types.find((t) => String(t.id) === match?.[1]),
          );
          if (match[2]) {
            if (method === 'GET')
              return state.items.filter((item) => item.typeId === type.id);
            if (method === 'POST') {
              const label = text(data.label, 100);
              const value = text(data.value, 100);
              if (
                !value ||
                !label.trim() ||
                state.items.some(
                  (item) => item.typeId === type.id && item.value === value,
                )
              )
                fail(400, '字典值或标签为空，或值重复');
              const nextId = Number(id());
              state.items.push({
                id: nextId,
                typeId: type.id,
                value,
                label,
                enabled: data.enabled === true,
                sortOrder: Number(data.sortOrder) || 0,
                remark: String(data.remark ?? ''),
              });
              type.revision++;
              changed = true;
              return nextId;
            }
          } else if (method === 'PUT') {
            if ('code' in data && data.code !== type.code)
              fail(400, '字典编码创建后不可修改');
            type.name = text(data.name, 100);
            type.enabled = data.enabled === true;
            type.remark = String(data.remark ?? '');
            type.revision++;
            changed = true;
            return null;
          }
        }
        match = path.match(/^\/system\/dict\/items\/(\d+)$/);
        if (match && method === 'PUT') {
          const item = found(
            state.items.find((item) => String(item.id) === match?.[1]),
          );
          if ('value' in data && data.value !== item.value)
            fail(400, '字典值创建后不可修改');
          item.label = text(data.label, 100);
          item.enabled = data.enabled === true;
          item.sortOrder = Number(data.sortOrder) || 0;
          item.remark = String(data.remark ?? '');
          changed = true;
          return null;
        }
        match = path.match(/^\/dict\/([^/]+)\/(options|labels\/([^/]+))$/);
        if (match && method === 'GET') {
          const type = state.types.find((t) => t.code === match?.[1]);
          const items = type
            ? state.items.filter((i) => i.typeId === type.id)
            : [];
          if (match[2] === 'options')
            return type?.enabled
              ? items
                  .filter((i) => i.enabled)
                  .toSorted((a, b) => a.sortOrder - b.sortOrder)
                  .map(({ value, label, sortOrder }) => ({
                    value,
                    label,
                    sortOrder,
                  }))
              : [];
          const item = items.find((i) => i.value === match?.[3]);
          return {
            value: match[3],
            label: item?.label ?? match[3],
            known: Boolean(item),
            enabled: Boolean(type?.enabled && item?.enabled),
          };
        }
        if (path === '/system/news') {
          if (method === 'GET')
            return page(filtered(state.news, params), params, true);
          if (method === 'POST') {
            const nextId = id();
            state.news.push(newsChange(data, nextId));
            changed = true;
            return nextId;
          }
        }
        match = path.match(/^\/system\/news\/(\d+)$/);
        if (match) {
          const news = found(
            state.news.find((r) => rowId(r, 'id', found(match?.[1]))),
          );
          if (method === 'GET') return news;
          if (method === 'PUT') {
            Object.assign(news, newsChange(data, String(news.id)));
            changed = true;
            return null;
          }
          if (method === 'DELETE') {
            state.news = state.news.filter((r) => r !== news);
            changed = true;
            return null;
          }
        }
        if (path === '/system/notice/list' && method === 'GET')
          return page(filtered(state.notices, params), params);
        match = path.match(/^\/system\/notice\/(\d+)$/);
        if (match && method === 'GET')
          return found(
            state.notices.find((r) => String(r.noticeId) === match?.[1]),
          );
        if (path === '/notifications/unread-count' && method === 'GET')
          return String(
            state.notifications.filter((n) => n.readTime === null).length,
          );
        if (path === '/notifications' && method === 'GET') {
          const rows =
            params.unreadOnly === true || params.unreadOnly === 'true'
              ? state.notifications.filter((n) => n.readTime === null)
              : state.notifications;
          const paged = page(rows, params);
          return {
            items: paged.records,
            total: paged.total,
            pageNum: paged.pageNum,
            pageSize: paged.pageSize,
          };
        }
        match = path.match(/^\/notifications\/(\d+)(\/read)?$/);
        if (match) {
          const notice = found(
            state.notifications.find((r) => String(r.id) === match?.[1]),
          );
          if (method === 'GET' && !match[2]) return notice;
          if (method === 'PUT' && match[2]) {
            notice.readTime = now();
            changed = true;
            return null;
          }
        }
        if (path === '/notifications/read' && method === 'PUT') {
          const ids = Array.isArray(data.ids)
            ? data.ids.map(String)
            : fail(400, '请选择通知');
          let count = 0;
          for (const n of state.notifications)
            if (ids.includes(String(n.id)) && n.readTime === null) {
              n.readTime = now();
              count++;
            }
          changed = true;
          return count;
        }
        if (path === '/lowcode/forms') {
          if (method === 'GET')
            return page(filtered(state.forms, params), params, true);
          if (method === 'POST') {
            const draft = formDraft(data);
            if (state.forms.some((f) => f.formKey === draft.formKey))
              fail(400, '表单标识重复');
            const nextId = id();
            state.forms.push({
              ...draft,
              id: nextId,
              status: 'draft',
              revision: 0,
              publishedVersion: 0,
              createTime: now(),
              updateTime: now(),
            });
            changed = true;
            return nextId;
          }
        }
        match = path.match(
          /^\/lowcode\/forms\/(\d+)(?:\/(publish|runtime|records)(?:\/(\d+))?)?$/,
        );
        if (match) {
          const form = found(state.forms.find((f) => f.id === match?.[1]));
          const action = match[2];
          const recordId = match[3];
          if (!action) {
            if (method === 'GET') return form;
            if (method === 'PUT') {
              revision(data.revision, form.revision);
              const draft = formDraft(data);
              if (draft.formKey !== form.formKey)
                fail(400, '表单标识创建后不可修改');
              Object.assign(form, draft, {
                revision: form.revision + 1,
                updateTime: now(),
              });
              changed = true;
              return form;
            }
            if (method === 'DELETE') {
              revision(Number(params.revision), form.revision);
              if (state.records.some((r) => r.formId === form.id))
                fail(400, '表单已有记录，请停用以保留历史');
              state.forms = state.forms.filter((f) => f !== form);
              changed = true;
              return null;
            }
          }
          if (action === 'publish' && method === 'POST') {
            revision(data.revision, form.revision);
            for (const record of state.records.filter(
              (r) => r.formId === form.id,
            ))
              for (const field of record.schema.fields) {
                if (
                  !form.schema.fields.some(
                    (f) =>
                      f.fieldKey === field.fieldKey && f.type === field.type,
                  )
                )
                  fail(400, '已有记录的字段不能删除或改变类型');
              }
            form.publishedVersion++;
            form.revision++;
            form.status = 'enabled';
            form.updateTime = now();
            const versions = state.published[form.id] ?? {};
            state.published[form.id] = versions;
            versions[String(form.publishedVersion)] = structuredClone(
              form.schema,
            );
            changed = true;
            return form;
          }
          if (action === 'runtime' && method === 'GET') {
            if (form.status !== 'enabled' || !form.publishedVersion)
              fail(404, '表单尚未发布或已停用');
            return {
              id: form.id,
              name: form.name,
              status: form.status,
              schemaVersion: form.publishedVersion,
              schema: state.published[form.id]?.[String(form.publishedVersion)],
            };
          }
          if (action === 'records') {
            if (!recordId && method === 'GET') {
              let records = state.records.filter((r) => r.formId === form.id);
              if (params.filterField && params.filterValue)
                records = records.filter((r) =>
                  String(r.data[String(params.filterField)] ?? '').includes(
                    String(params.filterValue),
                  ),
                );
              return page(records, params, true);
            }
            if (!recordId && method === 'POST') {
              if (
                form.status !== 'enabled' ||
                data.schemaVersion !== form.publishedVersion
              )
                fail(409, '表单已停用或发布版本变化，请刷新填写页');
              const schema = found(
                state.published[form.id]?.[String(form.publishedVersion)],
              );
              const values = data.data as Submission['data'];
              const error =
                values && typeof values === 'object'
                  ? dataError(schema, values)
                  : '填写数据不正确';
              if (error) fail(400, error);
              const record: FormRecord = {
                id: id(),
                formId: form.id,
                schemaVersion: form.publishedVersion,
                revision: 0,
                tenantId: 'demo',
                creator: '演示访客',
                createTime: now(),
                updateTime: now(),
                data: structuredClone(values),
                schema: structuredClone(schema),
              };
              state.records.push(record);
              changed = true;
              return record;
            }
            if (recordId) {
              const record = found(
                state.records.find(
                  (r) => r.formId === form.id && r.id === recordId,
                ),
              );
              if (method === 'GET') return record;
              if (method === 'PUT') {
                revision(data.revision, record.revision);
                if (data.schemaVersion !== record.schemaVersion)
                  fail(409, '记录版本不匹配，请重新读取');
                const values = data.data as Record<string, FieldValue>;
                const error =
                  values && typeof values === 'object'
                    ? dataError(record.schema, values)
                    : '填写数据不正确';
                if (error) fail(400, error);
                record.data = structuredClone(values);
                record.revision++;
                record.updateTime = now();
                changed = true;
                return record;
              }
              if (method === 'DELETE') {
                revision(Number(params.revision), record.revision);
                state.records = state.records.filter((r) => r !== record);
                changed = true;
                return null;
              }
            }
          }
        }
        return fail(
          501,
          '此操作未提供本地演示（账号/权限写入、上传导入、调度和外部服务均禁用），未发送网络请求',
        );
      };
      const value = result();
      if (changed) save(storage, state);
      return response(
        value instanceof Blob
          ? value
          : { code: 200, data: structuredClone(value), msg: '本地演示' },
      );
    } catch (error) {
      const status = error instanceof DemoFailure ? error.status : 400;
      const message =
        error instanceof DemoFailure
          ? error.message
          : '本地演示请求无效，操作未保存';
      const rejected = Object.assign(new Error(message), {
        isAxiosError: true,
        config,
        response: response({ code: status, data: null, msg: message }, status),
      });
      throw rejected;
    }
  };
}
function formDraft(data: Row): FormDraft {
  const draft = data as unknown as FormDraft;
  const error =
    draft.schema && Array.isArray(draft.schema.fields)
      ? schemaError(draft.schema)
      : '表单配置不正确';
  if (error) fail(400, error);
  if (
    !/^[a-z][a-z0-9_]{0,49}$/.test(draft.formKey) ||
    !draft.name?.trim() ||
    draft.name.length > 100 ||
    !['disabled', 'draft', 'enabled'].includes(draft.status)
  )
    fail(400, '表单标识、名称或状态不正确');
  return {
    name: draft.name,
    formKey: draft.formKey,
    status: draft.status,
    schema: structuredClone(draft.schema),
    revision: draft.revision,
  };
}
function newsChange(data: Row, id: string): Row {
  const title = text(data.title, 200);
  if (!title.trim()) fail(400, '请输入资讯标题');
  if (!['0', '1'].includes(String(data.status))) fail(400, '资讯状态须为0或1');
  return {
    id,
    title,
    summary: text(data.summary ?? '', 1000),
    content: text(data.content ?? '', 100_000),
    coverImage: '',
    category: text(data.category ?? '', 100),
    tags: text(data.tags ?? '[]', 2000),
    status: String(data.status),
    createTime: DEMO_TIME,
    updateTime: now(),
  };
}
