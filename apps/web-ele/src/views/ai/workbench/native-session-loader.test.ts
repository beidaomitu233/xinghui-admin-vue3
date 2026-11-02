import type { IAgentScopeRuntimeWebUIMessage } from '@agentscope-ai/chat';

import { flushPromises } from '@vue/test-utils';

import { act, createElement as h, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Test the installed, locked SDK loader, not a parallel session implementation.
import {
  ChatAnywhereMessagesContextProvider,
  useChatAnywhereMessages,
} from '../../../../node_modules/@agentscope-ai/chat/lib/AgentScopeRuntimeWebUI/core/Context/ChatAnywhereMessagesContext';
import {
  ChatAnywhereSessionsContextProvider,
  useChatAnywhereSessionLoader,
  useChatAnywhereSessions,
  useChatAnywhereSessionsState,
} from '../../../../node_modules/@agentscope-ai/chat/lib/AgentScopeRuntimeWebUI/core/Context/ChatAnywhereSessionsContext';

const api = vi.hoisted(() => ({
  getSessionList: vi.fn(),
  getSession: vi.fn(),
  createSession: vi.fn(),
  updateSession: vi.fn(),
}));
vi.mock(
  '../../../../node_modules/@agentscope-ai/chat/lib/AgentScopeRuntimeWebUI/core/Context/ChatAnywhereOptionsContext',
  () => ({
    useChatAnywhereOptions: <T>(
      select: (value: { session: { api: typeof api; multiple: boolean } }) => T,
    ) => select({ session: { api, multiple: true } }),
  }),
);
const reconnect = vi.hoisted(() => vi.fn());
vi.mock(
  '../../../../node_modules/@agentscope-ai/chat/lib/AgentScopeRuntimeWebUI/core/Context/useChatAnywhereEventEmitter',
  () => ({ emit: reconnect }),
);
let sessions!: ReturnType<typeof useChatAnywhereSessions>;
let messages!: ReturnType<typeof useChatAnywhereMessages>;
let root: ReturnType<typeof createRoot> | undefined;
let committedSession: string | undefined;
function Probe() {
  useChatAnywhereSessionLoader();
  sessions = useChatAnywhereSessions();
  messages = useChatAnywhereMessages();
  const { currentSessionId } = useChatAnywhereSessionsState();
  useEffect(() => {
    committedSession = currentSessionId;
  }, [currentSessionId]);
  return h('div');
}
async function render() {
  root = createRoot(document.createElement('div'));
  await act(async () => {
    root?.render(
      h(ChatAnywhereMessagesContextProvider, {
        children: h(ChatAnywhereSessionsContextProvider, {
          children: h(Probe),
        }),
      }),
    );
    await flushPromises();
  });
}
const question: IAgentScopeRuntimeWebUIMessage = {
  id: 'new-question',
  role: 'user',
  cards: [],
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  committedSession = undefined;
  api.getSessionList.mockResolvedValue([]);
  api.getSession.mockResolvedValue({ id: '', messages: [] });
  api.createSession.mockImplementation(async (draft) => {
    Object.assign(draft, { id: 'fresh-session' });
    return [draft];
  });
  api.updateSession.mockResolvedValue([]);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
});
describe('official session history loading', () => {
  it('keeps the first auto-created conversation question instead of restoring empty history over it', async () => {
    await render();
    await act(async () => {
      await sessions.createSession({ name: '检查业务配置' });
      expect(committedSession).toBe('fresh-session');
      messages.updateMessage(question);
      await flushPromises();
    });
    expect(api.getSession).not.toHaveBeenCalledWith('fresh-session');
    expect(messages.getMessages().map((item) => item.id)).toEqual([
      'new-question',
    ]);
  });
  it('does not let a late initial index clear an already created first conversation', async () => {
    let finish!: (value: unknown[]) => void;
    api.getSessionList.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render();
    await act(async () => {
      await sessions.createSession({ name: '查询任务' });
      messages.updateMessage(question);
      await flushPromises();
    });
    await act(async () => {
      finish([]);
      await flushPromises();
    });
    expect(sessions.getCurrentSessionId()).toBe('fresh-session');
    expect(messages.getMessages().map((item) => item.id)).toEqual([
      'new-question',
    ]);
  });
  it('discards a late restore when a new question has already been submitted', async () => {
    let finish!: (value: {
      generating: boolean;
      id: string;
      messages: IAgentScopeRuntimeWebUIMessage[];
    }) => void;
    api.getSessionList.mockResolvedValue([
      { id: 'existing', name: '历史会话', messages: [] },
    ]);
    api.getSession.mockImplementation((id) =>
      id === 'existing'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : Promise.resolve({ id: '', messages: [] }),
    );
    await render();
    await act(async () => {
      messages.updateMessage(question);
      await flushPromises();
    });
    await act(async () => {
      finish({ id: 'existing', messages: [], generating: true });
      await flushPromises();
    });
    expect(messages.getMessages().map((item) => item.id)).toEqual([
      'new-question',
    ]);
    expect(reconnect).not.toHaveBeenCalled();
  });
  it('does not apply a previous conversation response after switching to another one', async () => {
    const pending = new Map<
      string,
      (value: {
        id: string;
        messages: IAgentScopeRuntimeWebUIMessage[];
      }) => void
    >();
    api.getSessionList.mockResolvedValue([
      { id: 'a', name: 'A', messages: [] },
    ]);
    api.getSession.mockImplementation((id) =>
      id
        ? new Promise((resolve) => pending.set(id, resolve))
        : Promise.resolve({ id: '', messages: [] }),
    );
    await render();
    await act(async () => {
      sessions.changeCurrentSessionId('b');
      await flushPromises();
    });
    await act(async () => {
      pending.get('b')?.({
        id: 'b',
        messages: [{ id: 'b-question', role: 'user', cards: [] }],
      });
      await flushPromises();
    });
    await act(async () => {
      pending.get('a')?.({
        id: 'a',
        messages: [{ id: 'a-private', role: 'user', cards: [] }],
      });
      await flushPromises();
    });
    expect(messages.getMessages().map((item) => item.id)).toEqual([
      'b-question',
    ]);
  });
});
