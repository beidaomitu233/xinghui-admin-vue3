import type { IAgentScopeRuntimeWebUIOptions } from '@agentscope-ai/chat';

import type { HubChange } from './hub-adapter';

import type { AgentPreset } from '#/api/system/ai-workbench';

import {
  AgentScopeRuntimeWebUI,
  useChatAnywhereSessions,
  useChatAnywhereSessionsState,
} from '@agentscope-ai/chat';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Flex,
  message,
  Select,
  Steps,
  Table,
  Tag,
} from 'antd';
import { Sparkles } from 'lucide-react';
import { createElement as h, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { requestClient } from '#/api/request';
import { listAgentPresets } from '#/api/system/ai-workbench';

import { HubAdapter } from './hub-adapter';

const statusLabels: Record<string, string> = {
  EXECUTED: '已执行',
  REJECTED: '已取消',
  PENDING: '待确认',
  FAILED: '执行失败',
  EXPIRED: '已过期',
  CANCELLED: '任务已停止',
};
const fieldLabels: Record<string, string> = {
  username: '账号',
  nickname: '昵称',
  name: '名称',
  mobile: '手机号',
  email: '邮箱',
  status: '状态',
  enabled: '启用',
  remark: '备注',
  label: '显示名称',
  value: '值',
  roleIds: '角色',
  roleName: '角色名称',
  roleKey: '角色标识',
  sortOrder: '排序',
  configKey: '参数标识',
  configValue: '参数值',
  noticeTitle: '公告标题',
  noticeContent: '公告内容',
  clearSecrets: '清除密钥',
  secrets: '替换密钥',
};
const operationLabels: Record<string, string> = {
  create: '新增',
  update: '修改',
  delete: '删除',
  bulkCreate: '批量新增',
  bulkUpdate: '批量修改',
  bulkDelete: '批量删除',
  createType: '新增字典类型',
  updateType: '修改字典类型',
  createItem: '新增字典条目',
  updateItem: '修改字典条目',
  changeStatus: '修改任务状态',
  run: '执行任务',
};
const displayValue = (value: unknown) => {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
};
function ChangeCard({ value, session }: { session: string; value: HubChange }) {
  const [change, setChange] = useState(value);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    setChange((old) =>
      old.status !== 'PENDING' && value.status === 'PENDING' ? old : value,
    );
  }, [value]);
  useEffect(() => {
    if (change.status !== 'PENDING') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [change.status]);
  const preview = change.preview;
  const changes = preview.changes as Record<string, unknown> | undefined;
  const labels = { ...fieldLabels };
  const definition = preview.definition as
    | undefined
    | { schema?: { fields?: { fieldKey: string; label: string }[] } };
  definition?.schema?.fields?.forEach((field) => {
    labels[field.fieldKey] = field.label;
  });
  const before = (preview.before || {}) as Record<string, unknown>;
  const current = (before.data || before.user || before) as Record<
    string,
    unknown
  >;
  const operation = String(preview.operation || 'update');
  const rows = (
    proposed: Record<string, unknown>,
    prior: Record<string, unknown>,
  ) =>
    Object.entries(proposed)
      .filter(
        ([key]) =>
          ![
            'expectedValue',
            'id',
            'operation',
            'revision',
            'schemaVersion',
            'typeId',
          ].includes(key),
      )
      .map(([key, next]) => ({
        key,
        label: labels[key] || key,
        before: displayValue(prior[key] ?? prior[`${key}Masked`]),
        after: operation.includes('elete') ? '删除' : displayValue(next),
      }));
  const values = (changes?.data ||
    changes?.parameters ||
    changes ||
    {}) as Record<string, unknown>;
  const columns = [
    { title: '字段', dataIndex: 'label', width: 140 },
    { title: '当前值', dataIndex: 'before' },
    { title: '变更后', dataIndex: 'after' },
  ];
  const expired = now >= Date.parse(change.expiresAt);
  const state =
    change.status === 'PENDING' && expired ? 'EXPIRED' : change.status;
  const decide = async (approve: boolean) => {
    setBusy(true);
    try {
      const receipt = await requestClient.post<{ status: string }>(
        `/system/ai/hub/changes/${encodeURIComponent(change.id)}/decision`,
        { approve },
      );
      if (receipt.status === 'FAILED')
        message.error('变更未执行，Agent 将根据校验结果继续处理。');
      const updated = await requestClient.get<HubChange[]>(
        `/system/ai/hub/sessions/${encodeURIComponent(session)}/changes`,
      );
      setChange(updated.find((c) => c.id === change.id) || change);
    } catch {
      message.error('变更未执行，请检查权限、版本或当前任务状态。');
    } finally {
      setBusy(false);
    }
  };
  return h(
    Card,
    {
      size: 'small',
      title: `${operationLabels[operation] || operation} · ${String(preview.name || '业务数据')}`,
      extra: h(Tag, null, statusLabels[state] || state),
      style: { marginTop: 16, maxWidth: 720 },
    },
    h(Descriptions, {
      size: 'small',
      column: 1,
      items: [
        ...(changes?.id
          ? [{ key: 'target', label: '目标记录', children: String(changes.id) }]
          : []),
        {
          key: 'expires',
          label: '有效期至',
          children: new Date(change.expiresAt).toLocaleString(),
        },
      ],
    }),
    Array.isArray(changes?.items)
      ? h(Collapse, {
          items: (changes.items as Record<string, unknown>[]).map(
            (item, index) => ({
              key: index,
              label: `第 ${index + 1} 项${item.id ? ` · ${item.id}` : ''}`,
              children: h(Table, {
                size: 'small',
                pagination: false,
                columns,
                dataSource: rows(
                  (item.data || item) as Record<string, unknown>,
                  {},
                ),
                rowKey: 'key',
              }),
            }),
          ),
        })
      : h(Table, {
          size: 'small',
          pagination: false,
          columns,
          dataSource: rows(operation === 'delete' ? current : values, current),
          rowKey: 'key',
        }),
    state === 'FAILED'
      ? h(Alert, {
          type: 'error',
          showIcon: true,
          style: { marginTop: 12 },
          message: displayValue(
            (change.result as { message?: string })?.message ||
              '业务校验未通过',
          ),
        })
      : null,
    state === 'PENDING'
      ? h(
          Flex,
          { gap: 8, style: { marginTop: 16 } },
          h(
            Button,
            { type: 'primary', loading: busy, onClick: () => decide(true) },
            '确认执行',
          ),
          h(
            Button,
            { disabled: busy, onClick: () => decide(false) },
            '取消变更',
          ),
        )
      : null,
  );
}
function stepStatus(status: string): 'finish' | 'process' | 'wait' {
  if (status === 'COMPLETED') return 'finish';
  return status === 'IN_PROGRESS' ? 'process' : 'wait';
}
function TaskOutput({ data }: { data: { usage?: Record<string, unknown> } }) {
  const steps = (data.usage?.steps || []) as {
    id: string;
    status: string;
    title: string;
  }[];
  const changes = (data.usage?.changes || []) as HubChange[];
  const session = String(data.usage?.session || '');
  return h(
    'section',
    null,
    steps.length > 0
      ? h(Collapse, {
          size: 'small',
          ghost: true,
          items: [
            {
              key: 'steps',
              label: `任务进度 · ${steps.filter((s) => s.status === 'COMPLETED').length}/${steps.length}`,
              children: h(Steps, {
                direction: 'vertical',
                size: 'small',
                items: steps.map((s) => ({
                  title: s.title,
                  status: stepStatus(s.status),
                })),
              }),
            },
          ],
        })
      : null,
    ...changes.map((value) => h(ChangeCard, { key: value.id, value, session })),
  );
}

export async function mountHub(element: HTMLElement, dark: boolean) {
  const adapter = new HubAdapter();
  const root = createRoot(element);
  let choices: AgentPreset[] = [];
  try {
    choices = await listAgentPresets();
  } catch {
    /* Native page shows configuration state. */
  }
  adapter.scene = choices[0]?.sceneKey || '';
  let ensureSession = async () => {};
  function Controls() {
    const sessions = useChatAnywhereSessions();
    const { currentSessionId } = useChatAnywhereSessionsState();
    const [mode, setMode] = useState(adapter.mode);
    const [scene, setScene] = useState(adapter.scene);
    ensureSession = async () => {
      if (!sessions.getCurrentSessionId())
        await sessions.createSession({ name: '新对话' });
      adapter.current = sessions.getCurrentSessionId() || adapter.current;
    };
    useEffect(() => {
      adapter.current = currentSessionId || '';
    }, [currentSessionId]);
    return h(
      Flex,
      { gap: 8, align: 'center' },
      h(Select, {
        value: mode,
        size: 'small',
        variant: 'borderless',
        'aria-label': '任务模式',
        options: [
          { label: '执行', value: 'EXECUTE' },
          { label: '计划', value: 'PLAN' },
        ],
        onChange: (value: unknown) => {
          if (value === 'PLAN' || value === 'EXECUTE') {
            adapter.mode = value;
            setMode(value);
          }
        },
      }),
      h(Select, {
        value: scene || undefined,
        size: 'small',
        variant: 'borderless',
        'aria-label': 'Agent场景',
        placeholder: '配置Agent场景',
        style: { minWidth: 160, maxWidth: 260 },
        options: choices.map((p) => ({ label: p.name, value: p.sceneKey })),
        onChange: (value: unknown) => {
          if (typeof value === 'string') {
            adapter.scene = value;
            setScene(value);
          }
        },
      }),
    );
  }
  const options: IAgentScopeRuntimeWebUIOptions = {
    theme: {
      locale: 'cn',
      darkMode: dark,
      colorPrimary: '#2563eb',
      colorBgBase: dark ? '#171717' : '#ffffff',
      leftHeader: h(
        Flex,
        {
          align: 'center',
          gap: 10,
          style: { height: 40, whiteSpace: 'nowrap' },
        },
        h(Sparkles, { size: 22 }),
        h('strong', null, 'AI 中台'),
      ),
      typography: { baseFontSize: 15, baseLineHeight: 1.75 },
      bubbleList: { userMessageAnchors: { enabled: true } },
    },
    welcome: {
      avatar: h(Sparkles, { size: 36 }),
      greeting: '今天想完成什么？',
      description:
        choices.length > 0 ? '' : '请先在提示词配置中配置 Agent 场景和模型。',
      prompts: [],
    },
    session: { multiple: true, api: adapter.sessionAPI },
    api: {
      fetch: ({ input, signal }) => adapter.send(input, signal),
      cancel: ({ session_id }) => {
        void adapter.cancel(session_id);
      },
      reconnect: ({ session_id, signal }) =>
        adapter.reconnect(session_id, signal),
      enableHistoryMessages: false,
    },
    sender: {
      placeholder: '描述任务，或添加图片…',
      maxLength: 32_768,
      showCharacterCount: false,
      allowSpeech: false,
      longTextUpload: false,
      prefix: h(Controls),
      attachments: {
        accept: 'image/png,image/jpeg,image/webp,image/gif',
        multiple: true,
        maxCount: 4,
        beforeUpload: async (file) => {
          await ensureSession();
          if (file.size > 20 * 1024 * 1024) {
            message.error('图片不能超过20MB');
            return false;
          }
          return file;
        },
        customRequest: ({ file, onSuccess, onError }) => {
          void adapter
            .upload(file as File)
            .then((result) => onSuccess?.(result))
            .catch((error: Error) => onError?.(error));
        },
      },
    },
    response: {
      append: [
        {
          id: 'business-result',
          render: ({ data }) => h(TaskOutput, { data }),
        },
      ],
    },
  };
  root.render(h(AgentScopeRuntimeWebUI, { options }));
  return {
    dispose: () => {
      adapter.close();
      root.unmount();
    },
    setTheme: (darkMode: boolean) => {
      options.theme = {
        ...options.theme,
        darkMode,
        colorBgBase: darkMode ? '#171717' : '#ffffff',
      };
      root.render(h(AgentScopeRuntimeWebUI, { options: { ...options } }));
    },
  };
}
