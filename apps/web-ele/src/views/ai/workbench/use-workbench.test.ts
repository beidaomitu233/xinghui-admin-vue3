import type {
  AgentEvent,
  AgentRun,
  AgentSession,
} from '#/api/system/ai-workbench';

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkbench } from './use-workbench';

const state = vi.hoisted(() => ({
  auth: { accessToken: 'qa-token', accessCodes: ['ai:agent:invoke'] },
}));
const api = vi.hoisted(() => ({
  sessions: vi.fn(),
  presets: vi.fn(),
  session: vi.fn(),
  events: vi.fn(),
  run: vi.fn(),
  submit: vi.fn(),
  cancel: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => state.auth }));
vi.mock('#/api/system/ai-workbench', () => ({
  listAgentSessions: api.sessions,
  listAgentPresets: api.presets,
  getAgentSession: api.session,
  getAgentEvents: api.events,
  getAgentRun: api.run,
  submitAgentRun: api.submit,
  cancelAgentRun: api.cancel,
  createAgentSession: api.create,
  renameAgentSession: api.rename,
}));
const session: AgentSession = {
  id: 'session-one',
  title: '虚构任务',
  activeRunId: null,
  version: '1',
  updatedAt: '2026-10-24T00:00:00Z',
};
const task: AgentRun = {
  id: 'run-one',
  sessionId: session.id,
  status: 'RUNNING',
  sceneKey: 'scene.agent',
  errorCode: null,
  deadline: '2026-10-24T00:05:00Z',
};
let model: ReturnType<typeof useWorkbench>;
let wrapper: ReturnType<typeof mount>;
function setup() {
  wrapper = mount(
    defineComponent({
      setup() {
        model = useWorkbench();
        return () => h('div');
      },
    }),
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  state.auth = reactive({
    accessToken: 'qa-token',
    accessCodes: ['ai:agent:invoke'],
  });
  api.sessions.mockResolvedValue([session]);
  api.presets.mockResolvedValue([
    { sceneKey: 'scene.agent', name: '业务助手' },
  ]);
  api.session.mockResolvedValue(session);
  api.events.mockResolvedValue([]);
  api.run.mockResolvedValue(task);
});
afterEach(() => {
  wrapper?.unmount();
  vi.useRealTimers();
});

describe('workbench execution and reconnect boundaries', () => {
  it('polls and refreshes a running task without submitting it again', async () => {
    api.session.mockResolvedValue({ ...session, activeRunId: task.id });
    setup();
    await flushPromises();
    expect(model.running.value).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();
    await model.refresh();
    expect(api.events.mock.calls.length).toBeGreaterThan(2);
    expect(api.submit).not.toHaveBeenCalled();
    wrapper.unmount();
    const reads = api.events.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(api.events).toHaveBeenCalledTimes(reads);
  });
  it('retries an uncertain submission with exactly the same request id and payload', async () => {
    setup();
    await flushPromises();
    model.draft.value = '只处理虚构QA数据';
    api.submit.mockRejectedValueOnce(new Error('private upstream error'));
    await model.send();
    const first = api.submit.mock.calls[0]?.[1];
    expect(model.error.value).not.toContain('private upstream');
    expect(model.pending.value?.submission.clientRequestId).toBe(
      first.clientRequestId,
    );
    api.submit.mockResolvedValue({ created: false, run: task });
    api.session.mockResolvedValue({ ...session, activeRunId: task.id });
    await model.send();
    expect(api.submit.mock.calls[1]?.[1]).toEqual(first);
    expect(model.pending.value).toBeNull();
    expect(model.draft.value).toBe('');
  });
  it('discards late private history after logout or permission revocation', async () => {
    let complete: (events: AgentEvent[]) => void = () => {};
    api.events.mockReturnValueOnce(
      new Promise<AgentEvent[]>((resolve) => {
        complete = resolve;
      }),
    );
    setup();
    await flushPromises();
    state.auth.accessToken = '';
    await nextTick();
    complete([
      {
        id: '1',
        runId: task.id,
        type: 'USER_MESSAGE',
        data: { text: 'private fixture' },
        createdAt: session.updatedAt,
      },
    ]);
    await flushPromises();
    expect(model.history.messages).toEqual([]);
    expect(model.sessions.value).toEqual([]);
    expect(model.selected.value).toBeNull();
    state.auth.accessToken = 'other-token';
    state.auth.accessCodes = [];
    await nextTick();
    expect(model.allowed.value).toBe(false);
    expect(api.submit).not.toHaveBeenCalled();
  });
  it('ignores an old session poll that arrives after switching to another session', async () => {
    api.session.mockResolvedValue({ ...session, activeRunId: task.id });
    setup();
    await flushPromises();
    let complete: (events: AgentEvent[]) => void = () => {};
    api.events.mockReturnValueOnce(
      new Promise<AgentEvent[]>((resolve) => {
        complete = resolve;
      }),
    );
    await vi.advanceTimersByTimeAsync(1000);
    const second = { ...session, id: 'session-two', title: '第二项任务' };
    api.session.mockResolvedValue(second);
    await model.select(second);
    complete([
      {
        id: '99',
        runId: task.id,
        type: 'USER_MESSAGE',
        data: { text: 'first-session-only' },
        createdAt: session.updatedAt,
      },
    ]);
    await flushPromises();
    expect(model.selected.value?.id).toBe(second.id);
    expect(model.history.messages).toEqual([]);
    expect(api.submit).not.toHaveBeenCalled();
  });
});
