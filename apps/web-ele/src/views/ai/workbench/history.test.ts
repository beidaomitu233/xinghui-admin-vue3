import type { AgentEvent } from '#/api/system/ai-workbench';

import { describe, expect, it } from 'vitest';

import { applyEvents, emptyHistory } from './history';

const event = (
  id: string,
  type: string,
  data: Record<string, unknown>,
  runId = 'run-a',
): AgentEvent => ({ id, runId, type, data, createdAt: '2026-10-24T00:00:00Z' });
describe('durable public Agent history', () => {
  it('retains the explicit plan and run mode, then clears them for the next task', () => {
    const history = emptyHistory();
    applyEvents(history, [
      event('1', 'RUN_STATE', { status: 'QUEUED', mode: 'PLAN' }),
      event('2', 'PLAN_DOCUMENT', {
        markdown: '## 任务计划\n1. 查询商品\n2. 生成具体预览',
      }),
      event('3', 'RUN_STATE', { status: 'COMPLETED' }),
    ]);
    expect(history.mode).toBe('PLAN');
    expect(history.plan).toContain('生成具体预览');
    applyEvents(history, [
      event('4', 'RUN_STATE', { status: 'QUEUED', mode: 'EXECUTE' }, 'run-b'),
    ]);
    expect(history.mode).toBe('EXECUTE');
    expect(history.plan).toBe('');
  });
  it('keeps exact long cursors and does not duplicate replayed text or tools', () => {
    const history = emptyHistory();
    const first = event('9007199254740993001', 'TEXT_DELTA', {
      replyId: 'reply',
      delta: '第一段',
    });
    applyEvents(history, [first]);
    applyEvents(history, [
      first,
      event('9007199254740993002', 'TEXT_DELTA', {
        replyId: 'reply',
        delta: '第二段',
      }),
      event('9007199254740993003', 'TOOL_START', {
        callId: 'query',
        name: 'records_query',
      }),
    ]);
    applyEvents(history, [
      event('9007199254740993004', 'TOOL_END', {
        callId: 'query',
        name: 'records_query',
        state: 'COMPLETED',
      }),
    ]);
    expect(history.cursor).toBe('9007199254740993004');
    expect(history.messages).toHaveLength(2);
    expect(history.messages[0]?.text).toBe('第一段第二段');
    expect(history.messages[1]?.toolState).toBe('COMPLETED');
  });
  it('projects actual task steps and starts a new run without carrying old progress', () => {
    const history = emptyHistory();
    applyEvents(history, [
      event('1', 'PLAN', {
        steps: [
          { id: 'a', title: '读取记录', status: 'COMPLETED' },
          { id: 'b', title: '整理结果', status: 'IN_PROGRESS' },
        ],
      }),
      event('2', 'RUN_STATE', { status: 'COMPLETED' }),
      event('3', 'USER_MESSAGE', { text: '下一项任务' }, 'run-b'),
      event('4', 'RUN_STATE', { status: 'QUEUED' }, 'run-b'),
    ]);
    expect(history.currentRunId).toBe('run-b');
    expect(history.steps).toEqual([]);
    expect(history.status).toBe('QUEUED');
    expect(history.messages[0]?.text).toBe('下一项任务');
  });
  it('does not project private reasoning, hidden prompts or executable HTML', () => {
    const history = emptyHistory();
    applyEvents(history, [
      event('1', 'THINKING_DELTA', { delta: 'private reasoning' }),
      event('2', 'SYSTEM_PROMPT', { text: 'hidden prompt' }),
      event('3', 'TEXT_DELTA', {
        replyId: 'reply',
        delta: '<img src=x onerror=alert(1)>',
      }),
    ]);
    expect(history.messages.map((message) => message.text)).toEqual([
      '<img src=x onerror=alert(1)>',
    ]);
    expect(JSON.stringify(history)).not.toContain('private reasoning');
    expect(JSON.stringify(history)).not.toContain('hidden prompt');
  });
});
