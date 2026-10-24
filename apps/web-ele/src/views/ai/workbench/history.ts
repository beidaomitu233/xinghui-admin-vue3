import type { AgentEvent, AgentRunStatus } from '#/api/system/ai-workbench';

export interface ChatMessage {
  id: string;
  runId: string;
  role: 'ASSISTANT' | 'TOOL' | 'USER';
  text: string;
  toolState?: string;
}
export interface TaskStep {
  id: string;
  title: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
}
export interface AgentHistory {
  cursor: string;
  messages: ChatMessage[];
  currentRunId: string;
  status: AgentRunStatus | null;
  errorCode: null | string;
  phase: string;
  activeTool: string;
  steps: TaskStep[];
}
export const emptyHistory = (): AgentHistory => ({
  cursor: '0',
  messages: [],
  currentRunId: '',
  status: null,
  errorCode: null,
  phase: '',
  activeTool: '',
  steps: [],
});
export const isRunning = (status: AgentRunStatus | null | undefined) =>
  status === 'QUEUED' || status === 'RUNNING' || status === 'CANCELLING';
export const runLabels: Record<AgentRunStatus, string> = {
  QUEUED: '等待执行',
  RUNNING: '执行中',
  CANCELLING: '正在停止',
  COMPLETED: '已完成',
  CANCELLED: '已停止',
  FAILED: '执行失败',
  INTERRUPTED: '已中断',
};
export const toolLabel = (name: string) =>
  ({
    resources_list: '发现业务资源',
    resource_describe: '读取字段与操作',
    records_query: '查询业务数据',
    records_mutate: '更新业务数据',
    todo_write: '更新任务步骤',
  })[name] ?? '调用工具';
const newer = (id: string, cursor: string) =>
  /^\d{1,19}$/.test(id) &&
  (id.length > cursor.length || (id.length === cursor.length && id > cursor));
const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** Incremental public-event projection; reconnects can replay a page without duplicating text or tools. */
export function applyEvents(history: AgentHistory, events: AgentEvent[]) {
  for (const event of events) {
    if (!newer(event.id, history.cursor)) continue;
    history.cursor = event.id;
    const data = event.data;
    if (history.currentRunId !== event.runId) {
      history.currentRunId = event.runId;
      history.steps = [];
      history.errorCode = null;
      history.phase = '';
      history.activeTool = '';
      history.status = null;
    }
    switch (event.type) {
      case 'PHASE': {
        history.phase = text(data.phase);

        break;
      }
      case 'RUN_STATE': {
        const status = text(data.status);
        if (Object.hasOwn(runLabels, status))
          history.status = status as AgentRunStatus;
        history.errorCode = text(data.errorCode) || null;

        break;
      }
      case 'TEXT_DELTA': {
        if (!text(data.delta)) break;
        const id = `${event.runId}:${text(data.replyId)}`;
        let message = history.messages.find(
          (item) => item.role === 'ASSISTANT' && item.id === id,
        );
        if (!message) {
          message = { id, runId: event.runId, role: 'ASSISTANT', text: '' };
          history.messages.push(message);
        }
        message.text += text(data.delta);

        break;
      }
      case 'TOOL_END':
      case 'TOOL_START': {
        const id = `${event.runId}:tool:${text(data.callId)}`;
        let message = history.messages.find((item) => item.id === id);
        if (!message) {
          message = {
            id,
            runId: event.runId,
            role: 'TOOL',
            text: toolLabel(text(data.name)),
          };
          history.messages.push(message);
        }
        message.toolState =
          event.type === 'TOOL_START' ? 'RUNNING' : text(data.state);
        history.activeTool = event.type === 'TOOL_START' ? message.text : '';
        history.phase = event.type === 'TOOL_START' ? 'TOOL' : 'MODEL';

        break;
      }
      case 'USER_MESSAGE': {
        history.messages.push({
          id: event.id,
          runId: event.runId,
          role: 'USER',
          text: text(data.text),
        });

        break;
      }
      default: {
        if (event.type === 'PLAN' && Array.isArray(data.steps)) {
          history.steps = data.steps.flatMap((step: unknown) => {
            if (
              !step ||
              typeof step !== 'object' ||
              !('title' in step) ||
              !('id' in step) ||
              !('status' in step)
            )
              return [];
            const status = text(step.status);
            return typeof step.title === 'string' &&
              ['COMPLETED', 'IN_PROGRESS', 'PENDING'].includes(status)
              ? [
                  {
                    id: String(step.id),
                    title: step.title,
                    status: status as TaskStep['status'],
                  },
                ]
              : [];
          });
        }
      }
    }
  }
}
