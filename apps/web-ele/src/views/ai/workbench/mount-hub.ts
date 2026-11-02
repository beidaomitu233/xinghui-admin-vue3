import type {
  IAgentScopeRuntimeWebUIOptions,
  IAgentScopeRuntimeWebUIRef,
} from '@agentscope-ai/chat';
import type { ThemeConfig } from 'antd';
import type { ReactNode } from 'react';

import type { HubChange } from './hub-adapter';

import type { AgentPreset } from '#/api/system/ai-workbench';

import { TinyColor } from '@vben/utils';

import {
  AgentScopeRuntimeWebUI,
  Markdown,
  useChatAnywhereInput,
  useChatAnywhereSessions,
  useChatAnywhereSessionsState,
} from '@agentscope-ai/chat';
import {
  Alert,
  theme as antTheme,
  Button,
  Card,
  Collapse,
  ConfigProvider,
  Descriptions,
  Flex,
  message,
  Select,
  Steps,
  Table,
  Tag,
} from 'antd';
import { ClipboardCheck, ListChecks, Sparkles } from 'lucide-react';
import {
  createContext,
  createRef,
  createElement as h,
  useContext,
  useEffect,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';

import { requestClient } from '#/api/request';
import { listAgentPresets } from '#/api/system/ai-workbench';

import { HubAdapter } from './hub-adapter';
import { HubRequestActions } from './hub-message-actions';
import { recommendations } from './hub-recommendations';
import { HubSessions } from './hub-sessions';
import { submissionFailureResponse } from './hub-submission-error';

const statusLabels: Record<string, string> = {
  EXECUTED: '已执行',
  REJECTED: '已取消',
  PENDING: '待确认',
  FAILED: '执行失败',
  EXPIRED: '已过期',
  CANCELLED: '任务已停止',
};
function businessCardTheme(element: HTMLElement, dark: boolean): ThemeConfig {
  const styles = getComputedStyle(element);
  // AgentScope's theme generator accepts HEX; Element exposes computed RGB.
  const color = (name: string) =>
    new TinyColor(styles.getPropertyValue(name).trim()).toHexString();
  const statusText = (name: string, amount: number) =>
    new TinyColor(color(name)).darken(dark ? 0 : amount).toHexString();
  const statusBackground = (name: string) =>
    new TinyColor(color(name)).setAlpha(dark ? 0.16 : 0.08).toRgbString();
  return {
    inherit: false,
    algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
    token: {
      colorPrimary: color('--el-color-primary'),
      colorInfo: color('--el-color-primary'),
      colorSuccess: statusText('--el-color-success', 26),
      colorWarning: statusText('--el-color-warning', 30),
      colorError: statusText('--el-color-danger', 16),
      colorSuccessBg: statusBackground('--el-color-success'),
      colorWarningBg: statusBackground('--el-color-warning'),
      colorErrorBg: statusBackground('--el-color-danger'),
      colorInfoBg: statusBackground('--el-color-primary'),
      colorBgContainer: color('--el-bg-color-overlay'),
      colorBgElevated: color('--el-bg-color-overlay'),
      colorBorder: color('--el-border-color'),
      colorBorderSecondary: color('--el-border-color-light'),
      colorText: color('--el-text-color-primary'),
      colorTextSecondary: color('--el-text-color-secondary'),
      colorFillAlter: color('--el-fill-color-light'),
      borderRadius: 6,
      borderRadiusLG: 8,
      fontSize: 14,
    },
    components: {
      Card: {
        headerBg: 'transparent',
        headerFontSizeSM: 14,
        headerHeightSM: 48,
        headerPaddingSM: 16,
        bodyPaddingSM: 16,
      },
      Collapse: {
        headerBg: color('--el-bg-color-overlay'),
        contentBg: color('--el-bg-color-overlay'),
      },
    },
  };
}
const CardThemeContext = createContext<ThemeConfig>({});
function BusinessCards({ children }: { children: ReactNode }) {
  return h(ConfigProvider, { theme: useContext(CardThemeContext) }, children);
}
function changeColor(status: string) {
  if (status === 'EXECUTED') return 'success';
  if (status === 'PENDING') return 'warning';
  return status === 'FAILED' ? 'error' : 'default';
}
function cardTitle(title: string, kind: 'change' | 'task') {
  return h(
    Flex,
    { gap: 10, align: 'center', className: 'hub-card-title' },
    h(
      'span',
      { className: 'hub-card-icon', 'aria-hidden': true },
      h(kind === 'task' ? ListChecks : ClipboardCheck, { size: 16 }),
    ),
    h('span', null, title),
  );
}
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
  publish: '发布表单',
  markRead: '标记已读',
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
  const settled = state !== 'PENDING' && state !== 'FAILED';
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
  const details = h(
    Card,
    {
      size: 'small',
      className: 'hub-change-card',
      variant: settled ? 'borderless' : 'outlined',
      styles: settled ? { body: { padding: 0 } } : undefined,
      title: settled
        ? undefined
        : cardTitle(
            `${operationLabels[operation] || operation} · ${String(preview.name || '业务数据')}`,
            'change',
          ),
      extra: settled
        ? undefined
        : h(
            Tag,
            { color: changeColor(state), bordered: false },
            statusLabels[state] || state,
          ),
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
  return state === 'PENDING' || state === 'FAILED'
    ? details
    : h(Collapse, {
        size: 'small',
        className: 'hub-change-summary',
        items: [
          {
            key: change.id,
            label: `${operationLabels[operation] || operation} · ${String(preview.name || '业务数据')}`,
            extra: h(
              Tag,
              { color: changeColor(state), bordered: false },
              statusLabels[state] || state,
            ),
            children: details,
          },
        ],
      });
}
function stepStatus(status: string): 'finish' | 'process' | 'wait' {
  if (status === 'COMPLETED') return 'finish';
  return status === 'IN_PROGRESS' ? 'process' : 'wait';
}
function TaskOutput({
  data,
  onExecute,
  isLatest,
}: {
  data: { usage?: Record<string, unknown> };
  isLatest: () => boolean;
  onExecute: () => void;
}) {
  const { loading } = useChatAnywhereInput((value) => ({
    loading: value.loading,
  }));
  const usage = data.usage || {};
  if (
    !usage.runStatus &&
    !usage.plan &&
    !(usage.steps as unknown[])?.length &&
    !(usage.changes as unknown[])?.length
  )
    return null;
  const steps = (usage.steps || []) as {
    id: string;
    status: string;
    title: string;
  }[];
  const changes = (usage.changes || []) as HubChange[];
  const waiting = changes.some(
    (change) =>
      change.status === 'PENDING' && Date.now() < Date.parse(change.expiresAt),
  );
  const running = ['CANCELLING', 'QUEUED', 'RUNNING'].includes(
    String(usage.runStatus),
  );
  const planOnly = usage.mode === 'PLAN';
  let phase = '分析任务';
  if (waiting) phase = '等待确认';
  else
    switch (usage.runStatus) {
      case 'CANCELLED':
      case 'INTERRUPTED': {
        phase = '已停止';
        break;
      }
      case 'COMPLETED': {
        phase = planOnly ? '计划已就绪' : '已完成';
        break;
      }
      case 'FAILED': {
        phase = '执行未完成';
        break;
      }
      case 'QUEUED': {
        phase = '等待开始';
        break;
      }
      default: {
        if (usage.phase === 'TOOL') phase = '处理业务数据';
      }
    }
  let phaseDescription = '本轮任务已结束。';
  if (waiting) phaseDescription = '请核对下方变更，确认后继续处理。';
  else if (running) phaseDescription = '正在根据当前任务处理。';
  else if (planOnly)
    phaseDescription = '可继续执行计划，具体变更仍会逐项确认。';
  let color = 'default';
  if (waiting) color = 'warning';
  else if (running) color = 'processing';
  else if (usage.runStatus === 'FAILED') color = 'error';
  else if (usage.runStatus === 'COMPLETED')
    color = planOnly ? 'processing' : 'success';
  const completed = steps.filter((step) => step.status === 'COMPLETED').length;
  return h(
    'section',
    { className: 'hub-task-output' },
    h(
      Card,
      {
        size: 'small',
        className: 'hub-progress-card',
        title: cardTitle('任务进度', 'task'),
        extra: h(
          Flex,
          { gap: 8, align: 'center' },
          steps.length > 0
            ? h(
                'span',
                { className: 'hub-step-count' },
                `${completed}/${steps.length}`,
              )
            : null,
          h(Tag, { color, bordered: false }, phase),
        ),
      },
      steps.length > 0
        ? h(Steps, {
            direction: 'vertical',
            size: 'small',
            items: steps.map((step) => ({
              title: step.title,
              status: stepStatus(step.status),
            })),
          })
        : h('span', { className: 'hub-phase-description' }, phaseDescription),
      usage.plan
        ? h(Collapse, {
            ghost: true,
            size: 'small',
            defaultActiveKey: [],
            items: [
              {
                key: 'plan',
                label: '任务计划',
                children: h(Markdown, {
                  content: String(usage.plan),
                  allowHtml: false,
                  disableImage: true,
                }),
              },
            ],
          })
        : null,
      planOnly && usage.runStatus === 'COMPLETED' && isLatest()
        ? h(
            Button,
            {
              type: 'primary',
              disabled: Boolean(loading),
              style: { marginTop: 12 },
              onClick: onExecute,
            },
            '执行计划',
          )
        : null,
    ),
    ...changes.map((value) =>
      h(ChangeCard, {
        key: value.id,
        value,
        session: String(usage.session || ''),
      }),
    ),
  );
}

export async function mountHub(
  element: HTMLElement,
  dark: boolean,
  permissions: string[],
) {
  const adapter = new HubAdapter();
  const root = createRoot(element);
  const ui = createRef<IAgentScopeRuntimeWebUIRef>();
  let cardTheme = businessCardTheme(element, dark);
  let choices: AgentPreset[] = [];
  try {
    choices = await listAgentPresets();
  } catch {
    /* Native page shows configuration state. */
  }
  adapter.scene = choices[0]?.sceneKey || '';
  let ensureSession = async () => {};
  let setRunMode = (value: 'EXECUTE' | 'PLAN') => {
    adapter.mode = value;
  };
  function Controls() {
    const sessions = useChatAnywhereSessions();
    const { currentSessionId } = useChatAnywhereSessionsState();
    const [mode, setMode] = useState(adapter.mode);
    setRunMode = (value) => {
      adapter.mode = value;
      setMode(value);
    };
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
        'aria-label': '运行方式',
        options: [
          { label: '直接处理', value: 'EXECUTE' },
          { label: '仅制定计划', value: 'PLAN' },
        ],
        onChange: (value: unknown) => {
          if (value === 'PLAN' || value === 'EXECUTE') {
            setRunMode(value);
          }
        },
      }),
    );
  }
  const options: IAgentScopeRuntimeWebUIOptions = {
    theme: {
      locale: 'cn',
      darkMode: dark,
      colorPrimary: cardTheme.token?.colorPrimary,
      colorBgBase: cardTheme.token?.colorBgContainer,
      background: cardTheme.token?.colorBgContainer,
      leftHeader: { logo: '', title: '' },
      rightHeader: h(Controls),
      typography: { baseFontSize: 15, baseLineHeight: 1.75 },
      bubbleList: { userMessageAnchors: { enabled: true } },
    },
    welcome: {
      avatar: h(Sparkles, { size: 36 }),
      greeting: '今天想完成什么？',
      description:
        choices.length > 0 ? '' : '请先在 AI 配置中设置中台提示词和模型。',
      prompts: recommendations(permissions),
    },
    session: {
      multiple: true,
      api: adapter.sessionAPI,
      newChatLabel: '新建对话',
      renderList: h(HubSessions, { adapter }),
    },
    api: {
      fetch: async ({ input, signal }) => {
        try {
          return await adapter.send(input, signal);
        } catch (error) {
          if (signal?.aborted) throw error;
          return submissionFailureResponse(error);
        }
      },
      cancel: ({ session_id }) => {
        void adapter.cancel(session_id);
      },
      reconnect: ({ session_id, signal }) =>
        adapter.reconnect(session_id, signal),
      enableHistoryMessages: false,
      emitResponseWithoutContent: true,
    },
    sender: {
      placeholder: '描述任务，或添加图片…',
      maxLength: 32_768,
      showCharacterCount: false,
      allowSpeech: false,
      longTextUpload: false,
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
    request: {
      append: [
        {
          id: 'user-message-actions',
          render: ({ data }) =>
            h(HubRequestActions, {
              data,
              onSubmit: (draft) => ui.current?.input.submit(draft),
            }),
        },
      ],
    },
    response: {
      render: ({ data, fallback }) =>
        data.error ||
        data.output?.some(
          (item) =>
            item.type === 'message' &&
            item.content?.some(
              (content) => content.type === 'text' && content.text?.trim(),
            ),
        )
          ? h('div', { className: 'hub-answer' }, fallback())
          : null,
      append: [
        {
          id: 'business-result',
          render: ({ data }) =>
            h(
              BusinessCards,
              null,
              h(TaskOutput, {
                data,
                isLatest: () =>
                  adapter.isLatestRun(
                    String(data.usage?.session || ''),
                    data.id,
                  ),
                onExecute: () => {
                  setRunMode('EXECUTE');
                  ui.current?.input.submit({ query: '按刚才的计划继续执行。' });
                },
              }),
            ),
        },
      ],
    },
  };
  const render = () =>
    root.render(
      h(
        CardThemeContext.Provider,
        { value: cardTheme },
        h(AgentScopeRuntimeWebUI, { options: { ...options }, ref: ui }),
      ),
    );
  render();
  return {
    dispose: () => {
      adapter.close();
      root.unmount();
    },
    setTheme: (darkMode: boolean) => {
      cardTheme = businessCardTheme(element, darkMode);
      options.theme = {
        ...options.theme,
        darkMode,
        colorPrimary: cardTheme.token?.colorPrimary,
        colorBgBase: cardTheme.token?.colorBgContainer,
        background: cardTheme.token?.colorBgContainer,
      };
      render();
    },
  };
}
