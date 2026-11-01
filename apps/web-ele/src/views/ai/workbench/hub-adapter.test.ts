import type { AgentEvent } from '#/api/system/ai-workbench';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HubAdapter } from './hub-adapter';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  session: vi.fn(),
  create: vi.fn(),
  events: vi.fn(),
  submit: vi.fn(),
  cancel: vi.fn(),
  rename: vi.fn(),
  archive: vi.fn(),
  upload: vi.fn(),
  image: vi.fn(),
  changes: vi.fn(),
}));
vi.mock('#/api/request', () => ({ requestClient: { get: api.changes } }));
vi.mock('#/api/system/ai-workbench', () => ({
  listAgentSessions: api.list,
  getAgentSession: api.session,
  createAgentSession: api.create,
  getAgentEvents: api.events,
  submitAgentRun: api.submit,
  cancelAgentRun: api.cancel,
  renameAgentSession: api.rename,
  archiveAgentSession: api.archive,
  uploadAgentImage: api.upload,
  readAgentImage: api.image,
}));
vi.mock('./prepare-image', () => ({
  prepareImage: (file: File) => Promise.resolve(file),
}));
const session = {
  id: 'qa-session',
  title: 'QA商品任务',
  activeRunId: null,
  version: '1',
  updatedAt: '2026-10-26T00:00:00Z',
};
const event = (
  id: number,
  runId: string,
  type: string,
  data: Record<string, unknown>,
): AgentEvent => ({
  id: String(id),
  runId,
  type,
  data,
  createdAt: session.updatedAt,
});
const message = (text = '有哪些商品？') => [
  { role: 'user', content: [{ type: 'text', text }] },
];
const accepted = {
  created: true,
  run: { id: 'run-2', sessionId: session.id, status: 'QUEUED' },
};
const adapters: HubAdapter[] = [];
function adapter() {
  const value = new HubAdapter();
  value.current = session.id;
  value.scene = 'qa.agent';
  adapters.push(value);
  return value;
}
beforeEach(() => {
  vi.resetAllMocks();
  api.session.mockResolvedValue(session);
  api.list.mockResolvedValue([session]);
  api.create.mockResolvedValue(session);
  api.changes.mockResolvedValue([]);
  api.events.mockResolvedValue([]);
  api.cancel.mockResolvedValue({});
  api.submit.mockResolvedValue(accepted);
  api.image.mockResolvedValue(new Blob(['QA_IMAGE']));
});
afterEach(() => {
  adapters.forEach((a) => a.close());
  adapters.length = 0;
  vi.restoreAllMocks();
});

describe('official chat protocol adapter', () => {
  it('loads persisted turns with their own outcomes without invoking a model again', async () => {
    api.events.mockResolvedValue([
      event(1, 'run-1', 'USER_MESSAGE', { text: '看看商品' }),
      event(2, 'run-1', 'TEXT_DELTA', { delta: '有纸杯', replyId: 'a' }),
      event(3, 'run-1', 'RUN_STATE', { status: 'COMPLETED' }),
      event(4, 'run-2', 'USER_MESSAGE', { text: '改一下价格' }),
      event(5, 'run-2', 'RUN_STATE', {
        status: 'FAILED',
        errorCode: 'MODEL_UNAVAILABLE',
      }),
    ]);
    const chat = adapter();
    const result = await chat.load(session.id);
    expect(chat.isLatestRun(session.id, 'run-1')).toBe(false);
    expect(chat.isLatestRun(session.id, 'run-2')).toBe(true);
    expect(chat.isLatestRun('another-session', 'run-2')).toBe(false);
    expect(result.messages).toHaveLength(4);
    const responses = result.messages
      ?.filter((m) => m.role === 'assistant')
      .map(
        (m) =>
          m.cards?.[0]?.data as {
            error?: { code: string; message: string };
            status: string;
            usage?: { errorCode?: string };
          },
      );
    expect(responses?.map((r) => r.status)).toEqual(['completed', 'failed']);
    expect(responses?.[0]?.error).toBeUndefined();
    expect(responses?.[1]?.error?.code).not.toBe('MODEL_UNAVAILABLE');
    expect(responses?.[1]?.error?.message).toContain('已有步骤和结果会保留');
    expect(responses?.[1]?.usage?.errorCode).toBe('MODEL_UNAVAILABLE');
    expect(api.submit).not.toHaveBeenCalled();
  });
  it('delivers a pending change before any assistant text so user confirmation cannot deadlock', async () => {
    api.session.mockResolvedValue({ ...session, activeRunId: 'run-2' });
    api.events.mockResolvedValue([
      event(1, 'run-2', 'RUN_STATE', { status: 'RUNNING' }),
    ]);
    api.changes.mockResolvedValue([
      {
        id: 'change-1',
        runId: 'run-2',
        status: 'PENDING',
        preview: { name: 'QA商品', changes: { data: { price: 12.5 } } },
      },
    ]);
    const controller = new AbortController();
    const response = await adapter().reconnect(session.id, controller.signal);
    if (!response.body) throw new Error('Response stream missing');
    const reader = response.body.getReader();
    const chunk = await reader.read();
    expect(new TextDecoder().decode(chunk.value)).toContain('change-1');
    expect(new TextDecoder().decode(chunk.value)).toContain('"output":[]');
    controller.abort();
    await reader.cancel();
    expect(api.submit).not.toHaveBeenCalled();
  });
  it('settles the response stream when cancellation interrupts an event request', async () => {
    api.events.mockImplementation(
      (_s: string, _c: string, signal: AbortSignal) =>
        new Promise((_yes, no) =>
          signal.addEventListener(
            'abort',
            () => no(new DOMException('Stopped', 'AbortError')),
            { once: true },
          ),
        ),
    );
    const controller = new AbortController();
    const response = await adapter().send(message(), controller.signal);
    const text = response.text();
    controller.abort();
    await expect(text).resolves.toBe('');
  });
  it('cancels the admitted task if stop arrives before admission returns', async () => {
    let admit!: (value: typeof accepted) => void;
    api.submit.mockImplementation(
      () =>
        new Promise((yes) => {
          admit = yes;
        }),
    );
    const controller = new AbortController();
    const sending = adapter().send(message(), controller.signal);
    controller.abort();
    admit(accepted);
    const response = await sending;
    expect(api.cancel).toHaveBeenCalledWith('run-2');
    await expect(response.text()).resolves.toBe('');
  });
  it('does not submit when already stopped and rejects foreign image URLs instead of silently dropping them', async () => {
    const value = adapter();
    const controller = new AbortController();
    controller.abort();
    await expect(
      value.send(message(), controller.signal),
    ).rejects.toBeDefined();
    await expect(
      value.send([
        {
          content: [
            { type: 'image', image_url: 'https://untrusted.invalid/photo.png' },
          ],
        },
      ]),
    ).rejects.toThrow('图片不属于当前对话');
    expect(api.submit).not.toHaveBeenCalled();
  });
  it('supports a photo-only task using the uploaded image identity and current plan mode', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:qa-photo');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    api.upload.mockResolvedValue({
      id: 'qa-image',
      name: 'qa.png',
      mediaType: 'image/png',
      size: 8,
    });
    api.events.mockResolvedValue([
      event(1, 'run-2', 'RUN_STATE', { status: 'COMPLETED' }),
    ]);
    const value = adapter();
    value.mode = 'PLAN';
    await value.upload(new File(['QA_IMAGE'], 'qa.png', { type: 'image/png' }));
    const response = await value.send([
      { content: [{ type: 'image', image_url: 'blob:qa-photo' }] },
    ]);
    await response.text();
    expect(api.submit).toHaveBeenCalledWith(
      session.id,
      expect.objectContaining({
        input: '',
        imageIds: ['qa-image'],
        mode: 'PLAN',
      }),
    );
  });
  it('reuses an ambiguous request identity and refuses changing its mode or attachments', async () => {
    api.submit.mockRejectedValue(new Error('Connection interrupted'));
    const value = adapter();
    await expect(value.send(message())).rejects.toThrow();
    await expect(value.send(message())).rejects.toThrow();
    expect(api.submit.mock.calls[0]?.[1].clientRequestId).toBe(
      api.submit.mock.calls[1]?.[1].clientRequestId,
    );
    value.mode = 'PLAN';
    await expect(value.send(message())).rejects.toThrow('先重试原消息');
    expect(api.submit).toHaveBeenCalledTimes(2);
  });
  it('allows correcting a request after the backend explicitly rejects admission', async () => {
    api.submit.mockRejectedValueOnce({ response: { status: 400 } });
    const value = adapter();
    await expect(value.send(message())).rejects.toBeDefined();
    api.events.mockResolvedValue([
      event(1, 'run-2', 'RUN_STATE', { status: 'COMPLETED' }),
    ]);
    const response = await value.send(message('先列出商品名称'));
    await response.text();
    expect(api.submit).toHaveBeenCalledTimes(2);
    expect(api.submit.mock.calls[0]?.[1].clientRequestId).not.toBe(
      api.submit.mock.calls[1]?.[1].clientRequestId,
    );
  });
});
