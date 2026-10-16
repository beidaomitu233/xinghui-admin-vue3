export type AiEventName =
  | 'accepted'
  | 'cancelled'
  | 'completed'
  | 'delta'
  | 'failed'
  | 'usage';

export interface AiRuntimeEvent {
  errorCode?: string;
  inputTokens?: null | number;
  outputTokens?: null | number;
  requestId: string;
  sequence: number;
  status?: string;
  text?: string;
  type: AiEventName;
}

const eventNames = new Set<AiEventName>([
  'accepted',
  'cancelled',
  'completed',
  'delta',
  'failed',
  'usage',
]);
const terminalNames = new Set<AiEventName>([
  'cancelled',
  'completed',
  'failed',
]);

/** UTF-8 and SSE framing are independent of network chunk boundaries. No automatic retry. */
export class AiEventDecoder {
  get terminal() {
    return this.receivedTerminal;
  }
  private data: string[] = [];
  private dataLength = 0;
  private readonly decoder = new TextDecoder('utf-8', { fatal: true });
  private event = '';
  private lastSequence = 0;
  private pending = '';

  private receivedTerminal = false;

  constructor(
    private readonly requestId: string,
    private readonly onEvent: (event: AiRuntimeEvent) => void,
  ) {
    if (!/^\d+$/.test(requestId)) throw new Error('INVALID_REQUEST_ID');
  }

  finish() {
    this.lines(this.decoder.decode(), true);
    // A partial/unframed event at EOF is discarded. EOF itself can never complete a request.
    if (!this.receivedTerminal) throw new Error('STREAM_INCOMPLETE');
  }

  push(bytes: Uint8Array) {
    this.lines(this.decoder.decode(bytes, { stream: true }), false);
  }

  private dispatch() {
    if (this.data.length === 0) {
      this.event = '';
      return;
    }
    if (this.receivedTerminal) throw new Error('EVENT_AFTER_TERMINAL');
    const type = this.event as AiEventName;
    if (!eventNames.has(type)) throw new Error('INVALID_EVENT_TYPE');
    const value: unknown = JSON.parse(this.data.join('\n'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('INVALID_EVENT');
    }
    const fields = value as Record<string, unknown>;
    const errorCode = fields.errorCode ?? undefined;
    const sequence = fields.sequence;
    if (
      fields.requestId !== this.requestId ||
      typeof sequence !== 'number' ||
      !Number.isSafeInteger(sequence) ||
      sequence <= this.lastSequence ||
      (type === 'delta' && typeof fields.text !== 'string')
    ) {
      throw new Error('INVALID_EVENT');
    }
    if (
      (type === 'completed' &&
        (fields.status !== 'SUCCEEDED' || errorCode !== undefined)) ||
      (type === 'cancelled' && fields.status !== 'CANCELLED') ||
      (type === 'failed' &&
        !['FAILED', 'INCOMPLETE', 'TIMED_OUT'].includes(String(fields.status)))
    ) {
      throw new Error('INVALID_TERMINAL_EVENT');
    }
    for (const key of ['inputTokens', 'outputTokens']) {
      const count = fields[key];
      if (
        count !== undefined &&
        count !== null &&
        (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)
      ) {
        throw new Error('INVALID_USAGE');
      }
    }
    if (
      errorCode !== undefined &&
      (typeof errorCode !== 'string' ||
        !/^[A-Z][A-Z0-9_]{0,63}$/.test(errorCode))
    ) {
      throw new Error('INVALID_ERROR_CODE');
    }
    this.lastSequence = sequence;
    this.receivedTerminal = terminalNames.has(type);
    this.onEvent({
      errorCode: errorCode as string | undefined,
      inputTokens: fields.inputTokens as null | number | undefined,
      outputTokens: fields.outputTokens as null | number | undefined,
      requestId: this.requestId,
      sequence,
      status: typeof fields.status === 'string' ? fields.status : undefined,
      text: typeof fields.text === 'string' ? fields.text : undefined,
      type,
    });
    this.data = [];
    this.dataLength = 0;
    this.event = '';
  }

  private line(line: string) {
    if (line.length > 65_536) throw new Error('EVENT_LINE_TOO_LARGE');
    if (line === '') {
      this.dispatch();
      return;
    }
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const name = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (name === 'event') this.event = value;
    if (name === 'data') {
      this.dataLength += value.length + 1;
      if (this.dataLength > 131_072) throw new Error('EVENT_TOO_LARGE');
      this.data.push(value);
    }
    // id/retry are not replay instructions: resubscribe/status never creates another run.
  }

  private lines(text: string, final: boolean) {
    this.pending += text;
    let start = 0;
    for (let index = 0; index < this.pending.length; index++) {
      const character = this.pending[index];
      if (character !== '\r' && character !== '\n') continue;
      if (character === '\r' && index + 1 === this.pending.length && !final) {
        break;
      }
      this.line(this.pending.slice(start, index));
      if (character === '\r' && this.pending[index + 1] === '\n') index++;
      start = index + 1;
    }
    this.pending = this.pending.slice(start);
    if (this.pending.length > 65_536) throw new Error('EVENT_LINE_TOO_LARGE');
  }
}

export interface AiStreamOptions {
  apiBase: string;
  authorization: null | string;
  demo: boolean;
  onEvent: (event: AiRuntimeEvent) => void;
  signal: AbortSignal;
}

/** Raw fetch must be blocked before transport in demo; Axios demo adapters cannot intercept it. */
export async function openAiRequestEvents(
  requestId: string,
  options: AiStreamOptions,
) {
  if (options.demo || import.meta.env.VITE_APP_DEMO === 'true') {
    throw new Error('AI_DISABLED_IN_DEMO');
  }
  if (!/^\d+$/.test(requestId)) throw new Error('INVALID_REQUEST_ID');
  if (!options.authorization) throw new Error('UNAUTHENTICATED');
  options.signal.throwIfAborted();
  const response = await fetch(
    `${options.apiBase.replace(/\/$/, '')}/ai/requests/${requestId}/events`,
    {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        Accept: 'text/event-stream',
        Authorization: options.authorization,
      },
      method: 'GET',
      redirect: 'error',
      signal: options.signal,
    },
  );
  if (!response.ok) {
    // Do not expose arbitrary upstream/HTML bodies as application errors.
    await response.body?.cancel();
    throw new Error(`AI_HTTP_${response.status}`);
  }
  if (
    response.headers
      .get('Content-Type')
      ?.split(';', 1)[0]
      ?.trim()
      .toLowerCase() !== 'text/event-stream' ||
    !response.body
  ) {
    await response.body?.cancel();
    throw new Error('INVALID_STREAM_RESPONSE');
  }
  const decoder = new AiEventDecoder(requestId, options.onEvent);
  const reader = response.body.getReader();
  try {
    while (!decoder.terminal) {
      options.signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      decoder.push(value);
    }
    if (!decoder.terminal) options.signal.throwIfAborted();
    decoder.finish();
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Cancellation may already have closed the network reader.
    }
    reader.releaseLock();
  }
}
