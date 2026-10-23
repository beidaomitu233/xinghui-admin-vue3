import type { FormDefinition, FormRecord } from '../api/lowcode/forms';
import type { DictItem, DictType } from '../api/system/dict';

import { newField } from '../views/lowcode/form-schema';

export const DEMO_LOGIN = { phone: '13800000000', password: 'DemoOnly123!' };
export const DEMO_STORAGE_KEY = 'xinghui:public-static-demo:v1';
export const DEMO_TIME = '2026-10-16 09:00:00';
export const DEMO_IMAGE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="16" fill="#1668dc"/><circle cx="40" cy="29" r="13" fill="white"/><path d="M16 69a24 24 0 0 1 48 0" fill="white"/></svg>')}`;
type Row = Record<string, unknown>;
export interface DemoMenu extends Row {
  menuId: string;
  menuName: string;
  path: string;
  menuType: string;
  parentId: string;
  children?: DemoMenu[];
}
const leaf = (
  id: string,
  name: string,
  path: string,
  component: string,
  icon: string,
  order: number,
  parentId: string,
): DemoMenu => ({
  menuId: id,
  menuName: name,
  parentId,
  path,
  component,
  icon,
  orderNum: order,
  menuType: 'C',
  isFrame: '1',
  isCache: '0',
  visible: '0',
  status: '0',
  perms: '',
  createTime: DEMO_TIME,
});
export const DEMO_MENUS: DemoMenu[] = [
  {
    menuId: '1',
    menuName: '系统管理',
    parentId: '0',
    path: '/system',
    menuType: 'M',
    status: '0',
    visible: '0',
    createTime: DEMO_TIME,
    icon: 'carbon:settings',
    orderNum: 1,
    children: [
      leaf(
        '100',
        '用户管理',
        '/system/user',
        'system/user/index',
        'carbon:user',
        1,
        '1',
      ),
      leaf(
        '101',
        '角色管理',
        '/system/role',
        'system/role/index',
        'carbon:user-role',
        2,
        '1',
      ),
      leaf(
        '102',
        '菜单管理',
        '/system/menu',
        'system/menu/index',
        'carbon:menu',
        3,
        '1',
      ),
      leaf(
        '104',
        '字典管理',
        '/system/dict',
        'system/dict/index',
        'carbon:book',
        4,
        '1',
      ),
      leaf(
        '103',
        '参数设置',
        '/system/config',
        'system/config/index',
        'carbon:settings-adjust',
        5,
        '1',
      ),
      leaf(
        '1050',
        '系统业务配置',
        '/system/business-config',
        'system/business-config/index',
        'carbon:settings',
        6,
        '1',
      ),
    ],
  },
  {
    menuId: '3',
    menuName: '通用能力',
    parentId: '0',
    path: '/infra',
    menuType: 'M',
    status: '0',
    visible: '0',
    createTime: DEMO_TIME,
    icon: 'carbon:apps',
    orderNum: 2,
    children: [
      leaf(
        '3010',
        '表单管理',
        '/lowcode/forms',
        'lowcode/forms/index',
        'carbon:document',
        1,
        '3',
      ),
      leaf(
        '300',
        '文件管理',
        '/infra/file',
        'system/file/index',
        'carbon:folder',
        2,
        '3',
      ),
      leaf(
        '301',
        '通知公告',
        '/infra/notice',
        'system/notice/index',
        'carbon:notification',
        5,
        '3',
      ),
    ],
  },
  {
    menuId: '2',
    menuName: '运行维护',
    parentId: '0',
    path: '/monitor',
    menuType: 'M',
    status: '0',
    visible: '0',
    createTime: DEMO_TIME,
    icon: 'carbon:activity',
    orderNum: 3,
    children: [
      leaf(
        '200',
        '定时任务',
        '/monitor/job',
        'monitor/job/index',
        'carbon:time',
        1,
        '2',
      ),
      leaf(
        '201',
        '调度日志',
        '/monitor/jobLog',
        'monitor/jobLog/index',
        'carbon:document',
        2,
        '2',
      ),
      leaf(
        '202',
        '操作日志',
        '/monitor/operlog',
        'monitor/operlog/index',
        'carbon:activity',
        3,
        '2',
      ),
      leaf(
        '203',
        '工作台',
        '/workspace',
        'dashboard/workspace/index',
        'carbon:home',
        4,
        '2',
      ),
      leaf(
        '204',
        '看板',
        '/analytics',
        'dashboard/analytics/index',
        'carbon:chart-bar',
        5,
        '2',
      ),
    ],
  },
];
// Deliberately no vendor credentials, outbound tests, account resets or role writes.
DEMO_MENUS.push({
  menuId: '202610160180000001',
  menuName: 'AI管理',
  parentId: '0',
  path: '/ai',
  menuType: 'M',
  status: '0',
  visible: '0',
  createTime: DEMO_TIME,
  icon: 'carbon:machine-learning',
  orderNum: 4,
  children: [
    {
      ...leaf(
        '106',
        'AI配置',
        '/ai/configurations',
        'system/ai-config/index',
        'carbon:settings',
        1,
        '202610160180000001',
      ),
      perms: 'ai:config:list',
    },
    {
      ...leaf(
        '107',
        '提示词配置',
        '/ai/templates',
        'system/ai-template/index',
        'carbon:document',
        2,
        '202610160180000001',
      ),
      perms: 'ai:workspace:enter',
    },
    {
      ...leaf(
        '202610160180000003',
        '调用监控',
        '/ai/requests',
        'system/ai-request/index',
        'carbon:document',
        3,
        '202610160180000001',
      ),
      perms: 'ai:request:list',
    },
  ],
});
export const DEMO_PERMISSIONS = [
  'ai:workspace:enter',
  'ai:scene:list',
  'ai:scene:query',
  ...['config', 'application', 'template', 'data', 'request'].flatMap(
    (domain) => ['list', 'query'].map((action) => `ai:${domain}:${action}`),
  ),
  'system:user:list',
  'system:user:query',
  'system:role:list',
  'system:role:query',
  'system:menu:list',
  'system:menu:query',
  'system:dict:list',
  'system:dict:query',
  'system:dict:type:add',
  'system:dict:type:edit',
  'system:dict:item:add',
  'system:dict:item:edit',
  'system:config:list',
  'system:config:query',
  'system:businessConfig:query',
  'system:oss:list',
  'system:oss:query',
  'system:oss:download',
  'ai:model:list',
  'ai:model:query',
  'ai:prompt:list',
  'ai:prompt:query',
  'system:notice:list',
  'system:notice:query',
  'monitor:job:list',
  'monitor:job:query',
  'monitor:jobLog:list',
  'monitor:jobLog:query',
  'monitor:operlog:list',
  ...['list', 'query', 'add', 'edit', 'publish', 'remove'].map(
    (action) => `lowcode:form:${action}`,
  ),
  ...['list', 'query', 'add', 'edit', 'remove'].map(
    (action) => `lowcode:record:${action}`,
  ),
];
export interface DemoState {
  version: 1;
  sequence: number;
  session: null | string;
  types: DictType[];
  items: DictItem[];
  forms: FormDefinition[];
  records: FormRecord[];
  published: Record<string, Record<string, FormDefinition['schema']>>;
  notices: Row[];
  notifications: Row[];
}
export function createDemoState(): DemoState {
  const schema = {
    fields: [
      {
        ...newField(1),
        fieldKey: 'subject',
        label: '事项名称',
        required: true,
        searchable: true,
      },
      {
        ...newField(2),
        fieldKey: 'notes',
        label: '补充说明',
        type: 'textarea' as const,
        maxLength: 1000,
      },
      {
        ...newField(3),
        fieldKey: 'quantity',
        label: '数量',
        type: 'number' as const,
        min: 1,
        max: 100,
        defaultValue: 1,
      },
      {
        ...newField(4),
        fieldKey: 'date',
        label: '计划日期',
        type: 'date' as const,
      },
      {
        ...newField(5),
        fieldKey: 'priority',
        label: '优先级',
        type: 'select' as const,
        options: [
          { label: '普通', value: 'normal' },
          { label: '优先', value: 'high' },
        ],
        defaultValue: 'normal',
      },
      {
        ...newField(6),
        fieldKey: 'tags',
        label: '标签',
        type: 'multiselect' as const,
        options: [
          { label: '学习', value: 'learn' },
          { label: '体验', value: 'try' },
        ],
        defaultValue: [],
      },
      {
        ...newField(7),
        fieldKey: 'confirmed',
        label: '已确认',
        type: 'switch' as const,
        defaultValue: false,
      },
    ],
  };
  return {
    version: 1,
    sequence: 10_000,
    session: null,
    types: [
      {
        id: 1,
        code: 'notice_type',
        name: '公告类型（演示）',
        enabled: true,
        revision: 0,
      },
      {
        id: 2,
        code: 'job_status',
        name: '任务状态（演示）',
        enabled: true,
        revision: 0,
      },
    ],
    items: [
      {
        id: 11,
        typeId: 1,
        value: '1',
        label: '通知',
        sortOrder: 1,
        enabled: true,
      },
      {
        id: 12,
        typeId: 1,
        value: '2',
        label: '公告',
        sortOrder: 2,
        enabled: true,
      },
      {
        id: 21,
        typeId: 2,
        value: '0',
        label: '正常',
        sortOrder: 1,
        enabled: true,
      },
      {
        id: 22,
        typeId: 2,
        value: '1',
        label: '暂停',
        sortOrder: 2,
        enabled: true,
      },
    ],
    forms: [
      {
        id: '2001',
        name: '体验反馈（纯本地）',
        formKey: 'demo_feedback',
        status: 'enabled',
        revision: 1,
        publishedVersion: 1,
        schema,
        createTime: DEMO_TIME,
        updateTime: DEMO_TIME,
      },
    ],
    published: { '2001': { '1': structuredClone(schema) } },
    records: [
      {
        id: '3001',
        formId: '2001',
        schemaVersion: 1,
        revision: 0,
        tenantId: 'demo',
        creator: '演示访客',
        createTime: DEMO_TIME,
        updateTime: DEMO_TIME,
        schema: structuredClone(schema),
        data: {
          subject: '欢迎体验表单',
          notes: '内容只保存在当前浏览器，可编辑、删除或重置。',
          quantity: 1,
          date: '2026-10-16',
          priority: 'normal',
          tags: ['try'],
          confirmed: true,
        },
      },
    ],
    notices: [
      {
        noticeId: 1,
        noticeTitle: '静态演示使用说明',
        noticeType: '2',
        noticeContent: '不输入真实凭据；外部供应商、账号及权限写操作已关闭。',
        status: '0',
        createBy: '演示管理员',
        createTime: DEMO_TIME,
        updateTime: DEMO_TIME,
        remark: '纯虚构示例',
      },
    ],
    notifications: [
      {
        id: 1,
        eventCode: 'demo.welcome',
        eventKey: 'public-welcome',
        title: '欢迎体验',
        body: '这是一条本地个人通知。可以标记已读。',
        target: '/lowcode/forms',
        readTime: null,
        createTime: DEMO_TIME,
      },
    ],
  };
}
