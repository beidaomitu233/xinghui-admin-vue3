import type {
  IAgentScopeRuntimeWebUISessionAPI,
  IAgentScopeRuntimeWebUIMessage as Message,
  IAgentScopeRuntimeWebUISession as Session,
} from '@agentscope-ai/chat';

import type { AgentHistory } from './history';

import type { AgentImage, AgentSession } from '#/api/system/ai-workbench';

import { requestClient } from '#/api/request';
import { aiErrorMessage } from '#/api/system/ai-runtime-errors';
import {
  archiveAgentSession,
  cancelAgentRun,
  createAgentSession,
  getAgentEvents,
  getAgentSession,
  listAgentSessions,
  readAgentImage,
  renameAgentSession,
  submitAgentRun,
  uploadAgentImage,
} from '#/api/system/ai-workbench';

import { applyEvents, emptyHistory, isRunning } from './history';
import { HubSubmissionError } from './hub-submission-error';
import { prepareImage } from './prepare-image';

export interface HubChange {
  id: string;
  runId: string;
  resource: string;
  status: string;
  preview: Record<string, unknown>;
  result?: unknown;
  expiresAt: string;
}
type RuntimeResponse = {
  created_at: number;
  error?: { code: string; message: string };
  id: string;
  object: 'response';
  output: unknown[];
  status: string;
  usage?: Record<string, unknown>;
};
const doneStatus = (state: AgentHistory) => {
  if (isRunning(state.status)) return 'in_progress';
  if (state.status === 'COMPLETED') return 'completed';
  if (state.status === 'CANCELLED') return 'canceled';
  return 'failed';
};

/** Protocol adapter only. AgentScope owns conversation UI, input, attachments, markdown and message actions. */
export class HubAdapter {
  current = '';
  mode: 'EXECUTE' | 'PLAN' = 'EXECUTE';
  scene = '';
  private sessions = new Map<string, AgentSession>();
  readonly sessionAPI: IAgentScopeRuntimeWebUISessionAPI = {
    getSessionList: async () => this.list(),
    getSession: async (id) => {
      this.current = id || '';
      if (!id) return { id: '', name: '', messages: [] };
      return this.load(id);
    },
    createSession: async (draft) => {
      const created = await createAgentSession(
        (draft.name || '新对话').slice(0, 160),
      );
      Object.assign(draft, { id: created.id });
      this.current = created.id;
      this.sessions.set(created.id, created);
      return this.list();
    },
    updateSession: async (draft) => {
      if (draft.id && draft.name) {
        const value =
          this.sessions.get(draft.id) || (await getAgentSession(draft.id));
        await renameAgentSession(
          draft.id,
          draft.name.slice(0, 160),
          value.version,
        );
      }
      return this.list();
    },
    removeSession: async (draft) => {
      if (draft.id) await archiveAgentSession(draft.id);
      return this.list();
    },
  };
  private abort = new Set<AbortController>();
  private changes = new Map<string, HubChange[]>();
  private histories = new Map<string, AgentHistory>();
  private images = new Map<string, string>();
  private pending = new Map<string, { fingerprint: string; id: string }>();

  private runs = new Map<string, AgentHistory>();

  async cancel(id: string) {
    const s = await getAgentSession(id);
    if (s.activeRunId) await cancelAgentRun(s.activeRunId);
  }

  close() {
    this.abort.forEach((c) => c.abort());
    this.images.forEach((url) => URL.revokeObjectURL(url));
    this.images.clear();
  }
  isLatestRun(session: string, run: string) {
    return this.histories.get(session)?.currentRunId === run;
  }
  async list(): Promise<Session[]> {
    const sessions = await listAgentSessions();
    this.sessions = new Map(sessions.map((s) => [s.id, s]));
    return sessions.map((s) => ({
      id: s.id,
      name: s.title,
      messages: [],
      generating: Boolean(s.activeRunId),
    }));
  }
  async load(id: string): Promise<Session> {
    const [session, history] = await Promise.all([
      getAgentSession(id),
      this.read(id, true),
    ]);
    this.sessions.set(id, session);
    await this.refreshChanges(id);
    const messages: Message[] = [];
    for (const user of history.messages.filter((m) => m.role === 'USER')) {
      const content: unknown[] = [
        { type: 'text', text: user.text, status: 'completed' },
      ];
      for (const attached of user.images || [])
        content.push({
          type: 'image',
          image_url: await this.image(id, attached),
          status: 'completed',
        });
      messages.push(
        {
          id: user.id,
          role: 'user',
          cards: [
            {
              code: 'AgentScopeRuntimeRequestCard',
              data: { input: [{ role: 'user', type: 'message', content }] },
            },
          ],
        },
        {
          id: user.runId,
          role: 'assistant',
          cards: [
            {
              code: 'AgentScopeRuntimeResponseCard',
              data: this.response(history, user.runId, id),
            },
          ],
        },
      );
    }
    return {
      id,
      name: session.title,
      messages,
      generating: isRunning(history.status),
    };
  }
  async reconnect(id: string, signal?: AbortSignal) {
    const s = await getAgentSession(id);
    return this.stream(id, s.activeRunId || '', signal);
  }
  response(
    history: AgentHistory,
    run: string,
    session: string,
  ): RuntimeResponse {
    history = this.runs.get(run) || history;
    const messages = history.messages.filter(
      (m) => m.runId === run && m.role === 'ASSISTANT',
    );
    return {
      id: run,
      object: 'response',
      created_at: Date.now() / 1000,
      status: doneStatus(history),
      output: messages.map((m) => ({
        id: m.id,
        object: 'message',
        role: 'assistant',
        type: 'message',
        status: doneStatus(history),
        content: [{ type: 'text', text: m.text, status: doneStatus(history) }],
      })),
      usage: {
        steps: history.steps,
        changes: (this.changes.get(session) || []).filter(
          (c) => c.runId === run,
        ),
        session,
        phase: history.phase,
        runStatus: history.status,
        mode: history.mode,
        plan: history.plan,
        errorCode: history.errorCode || undefined,
      },
      ...(history.errorCode
        ? {
            error: {
              code: aiErrorMessage(history.errorCode),
              message: '本轮任务未完成，已有步骤和结果会保留。',
            },
          }
        : {}),
    };
  }
  async send(input: unknown[], signal?: AbortSignal): Promise<Response> {
    signal?.throwIfAborted();
    if (!this.scene) throw new HubSubmissionError('AGENT_PROMPT_UNAVAILABLE');
    const last = input.at(-1) as
      | undefined
      | {
          content?: { image_url?: string; text?: string; type: string }[];
          role?: string;
        };
    const text =
      last?.content
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text || '')
        .join('\n') || '';
    // Never fall back to an older question: it might repeat a business write.
    if (
      !last ||
      last.role !== 'user' ||
      text.length > 32_768 ||
      (!text.trim() && !last.content?.some((c) => c.type === 'image'))
    )
      throw new HubSubmissionError('INVALID_MESSAGE');
    let session = this.current;
    if (!session) {
      const created = await createAgentSession(text.slice(0, 160));
      this.current = created.id;
      session = created.id;
    }
    const imageIds = (last?.content || [])
      .filter((c) => c.type === 'image')
      .map((c) => {
        const key = [...this.images.entries()].find(
          ([key, url]) => key.startsWith(`${session}:`) && url === c.image_url,
        )?.[0];
        if (!key) throw new Error('图片不属于当前对话，请重新添加后发送。');
        return key.slice(session.length + 1);
      });
    const fingerprint = JSON.stringify({
      text,
      imageIds,
      scene: this.scene,
      mode: this.mode,
    });
    const prior = this.pending.get(session);
    if (prior && prior.fingerprint !== fingerprint)
      throw new Error('上次提交结果未确认，请先重试原消息后继续。');
    const request = prior || { fingerprint, id: crypto.randomUUID() };
    signal?.throwIfAborted();
    this.pending.set(session, request);
    let admission;
    try {
      admission = await submitAgentRun(session, {
        input: text,
        sceneKey: this.scene,
        clientRequestId: request.id,
        imageIds,
        mode: this.mode,
      });
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      if (status && [400, 401, 403, 404, 409, 413, 429].includes(status))
        this.pending.delete(session);
      throw error;
    }
    this.pending.delete(session);
    if (signal?.aborted) await cancelAgentRun(admission.run.id);
    return this.stream(session, admission.run.id, signal);
  }
  sessionUpdatedAt(id: string) {
    return this.sessions.get(id)?.updatedAt;
  }
  async upload(file: File) {
    if (!this.current) throw new Error('请先创建对话后添加图片。');
    const attached = await uploadAgentImage(
      this.current,
      await prepareImage(file),
    );
    const url = await this.image(this.current, attached);
    return { url, imageId: attached.id, sessionId: this.current };
  }
  private async image(session: string, image: AgentImage) {
    const key = `${session}:${image.id}`;
    let url = this.images.get(key);
    if (!url) {
      url = URL.createObjectURL(await readAgentImage(session, image.id));
      this.images.set(key, url);
    }
    return url;
  }
  private async read(id: string, fresh = false, signal?: AbortSignal) {
    const history = fresh
      ? emptyHistory()
      : this.histories.get(id) || emptyHistory();
    for (;;) {
      const events = await getAgentEvents(id, history.cursor, signal);
      applyEvents(history, events);
      for (const event of events) {
        const state = this.runs.get(event.runId) || emptyHistory();
        applyEvents(state, [event]);
        this.runs.set(event.runId, state);
      }
      if (events.length < 200) break;
    }
    this.histories.set(id, history);
    return history;
  }
  private async refreshChanges(id: string, signal?: AbortSignal) {
    const changes = await requestClient.get<HubChange[]>(
      `/system/ai/hub/sessions/${encodeURIComponent(id)}/changes`,
      { signal },
    );
    this.changes.set(id, changes);
  }
  private stream(session: string, run: string, parent?: AbortSignal): Response {
    const controller = new AbortController();
    this.abort.add(controller);
    const abortParent = () => controller.abort();
    parent?.addEventListener('abort', abortParent, { once: true });
    if (parent?.aborted) controller.abort();
    const encoder = new TextEncoder();
    let consumerCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start: async (stream) => {
        try {
          for (;;) {
            if (controller.signal.aborted) break;
            const history = await this.read(session, false, controller.signal);
            await this.refreshChanges(session, controller.signal);
            if (controller.signal.aborted) break;
            stream.enqueue(
              encoder.encode(
                `data: ${JSON.stringify(this.response(history, run || history.currentRunId, session))}\n\n`,
              ),
            );
            if (!isRunning(history.status)) break;
            await new Promise<void>((resolve) => {
              const finish = () => {
                clearTimeout(timer);
                controller.signal.removeEventListener('abort', finish);
                resolve();
              };
              const timer = setTimeout(finish, 600);
              controller.signal.addEventListener('abort', finish, {
                once: true,
              });
            });
          }
        } catch (error) {
          if (!controller.signal.aborted) stream.error(error);
        } finally {
          if (!consumerCancelled) {
            try {
              stream.close();
            } catch {
              /* The stream may already have errored. */
            }
          }
          this.abort.delete(controller);
          parent?.removeEventListener('abort', abortParent);
        }
      },
      cancel() {
        consumerCancelled = true;
        controller.abort();
      },
    });
    return new Response(body, {
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }
}
