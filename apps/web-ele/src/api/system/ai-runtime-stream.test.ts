import { describe, expect, it, vi } from 'vitest';

import { AiEventDecoder, openAiRequestEvents } from './ai-runtime-stream';

const encode = (text: string) => new TextEncoder().encode(text);
const frame = (type: string, fields: object) =>
  `event: ${type}\r\ndata: ${JSON.stringify({ requestId: '123', ...fields })}\r\n\r\n`;

describe('ai event framing', () => {
  it.each([':', 'event:', 'data:'])(
    'bounds complete %s lines that arrive with a newline',
    (prefix) => {
      const decoder = new AiEventDecoder('123', vi.fn());
      expect(() =>
        decoder.push(encode(`${prefix}${'x'.repeat(65_537)}\n\n`)),
      ).toThrow('EVENT_LINE_TOO_LARGE');
    },
  );

  it('treats null error codes as absent and rejects nonempty errors on success', () => {
    const receive = vi.fn();
    const decoder = new AiEventDecoder('123', receive);
    decoder.push(
      encode(
        frame('completed', {
          errorCode: null,
          sequence: 1,
          status: 'SUCCEEDED',
        }),
      ),
    );
    decoder.finish();
    expect(receive.mock.calls[0]?.[0].errorCode).toBeUndefined();
    expect(() =>
      new AiEventDecoder('123', vi.fn()).push(
        encode(
          frame('completed', {
            errorCode: 'PROVIDER_UNAVAILABLE',
            sequence: 1,
            status: 'SUCCEEDED',
          }),
        ),
      ),
    ).toThrow('INVALID_TERMINAL_EVENT');
  });
  it('decodes UTF-8 and CRLF split at every byte with ordered terminal events', () => {
    const receive = vi.fn();
    const decoder = new AiEventDecoder('123', receive);
    const bytes = encode(
      `: heartbeat\r\n\r\n${frame('accepted', { sequence: 1, status: 'QUEUED' })}${frame('delta', { sequence: 2, text: '摘要📝' })}${frame('completed', { sequence: 3, status: 'SUCCEEDED' })}`,
    );
    for (const byte of bytes) decoder.push(Uint8Array.of(byte));
    decoder.finish();
    expect(receive.mock.calls.map(([event]) => event.type)).toEqual([
      'accepted',
      'delta',
      'completed',
    ]);
    expect(receive.mock.calls[1]?.[0].text).toBe('摘要📝');
    expect(decoder.terminal).toBe(true);
  });

  it('accepts multiline data, lone CR and comments without treating EOF as success', () => {
    const receive = vi.fn();
    const decoder = new AiEventDecoder('123', receive);
    decoder.push(
      encode(
        'event: delta\rdata: {"requestId":"123",\rdata: "sequence":1,"text":"partial"}\r\r',
      ),
    );
    expect(() => decoder.finish()).toThrow('STREAM_INCOMPLETE');
    expect(receive).toHaveBeenCalledOnce();
    expect(receive.mock.calls[0]?.[0].text).toBe('partial');
  });

  it('preserves unknown token values and validates only explicit success', () => {
    const receive = vi.fn();
    const decoder = new AiEventDecoder('123', receive);
    decoder.push(
      encode(
        frame('usage', { inputTokens: null, outputTokens: 0, sequence: 1 }) +
          frame('failed', { sequence: 2, status: 'INCOMPLETE' }),
      ),
    );
    decoder.finish();
    expect(receive.mock.calls[0]?.[0].inputTokens).toBeNull();
    expect(receive.mock.calls[0]?.[0].outputTokens).toBe(0);
    const invalid = new AiEventDecoder('123', vi.fn());
    expect(() =>
      invalid.push(
        encode(frame('completed', { sequence: 1, status: 'RUNNING' })),
      ),
    ).toThrow('INVALID_TERMINAL_EVENT');
  });

  it.each([
    ['wrong request', { requestId: '999', sequence: 1, text: 'x' }],
    ['zero sequence', { sequence: 0, text: 'x' }],
    ['invalid delta', { sequence: 1, text: {} }],
    ['invalid usage', { inputTokens: -1, sequence: 1, text: 'x' }],
    [
      'raw error',
      { errorCode: 'secret from provider', sequence: 1, text: 'x' },
    ],
  ])('rejects %s', (_label, fields) => {
    const decoder = new AiEventDecoder('123', vi.fn());
    expect(() => decoder.push(encode(frame('delta', fields)))).toThrow();
  });

  it('rejects replay sequences, invalid UTF-8, oversized lines and terminal continuations', () => {
    const decoder = new AiEventDecoder('123', vi.fn());
    decoder.push(encode(frame('delta', { sequence: 1, text: 'x' })));
    expect(() =>
      decoder.push(encode(frame('delta', { sequence: 1, text: 'x' }))),
    ).toThrow('INVALID_EVENT');
    expect(() =>
      new AiEventDecoder('123', vi.fn()).push(Uint8Array.of(255)),
    ).toThrow();
    expect(() =>
      new AiEventDecoder('123', vi.fn()).push(encode('x'.repeat(65_537))),
    ).toThrow('EVENT_LINE_TOO_LARGE');
    const terminal = new AiEventDecoder('123', vi.fn());
    terminal.push(
      encode(frame('cancelled', { sequence: 1, status: 'CANCELLED' })),
    );
    expect(() =>
      terminal.push(encode(frame('delta', { sequence: 2, text: 'x' }))),
    ).toThrow('EVENT_AFTER_TERMINAL');
  });
});

describe('ai authenticated stream transport', () => {
  const options = () => ({
    apiBase: '/api',
    authorization: 'raw-existing-jwt',
    demo: false,
    onEvent: vi.fn(),
    signal: new AbortController().signal,
  });

  it('keeps validated completion when its callback aborts local transport cleanup', async () => {
    const controller = new AbortController();
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(frame('completed', { sequence: 1, status: 'SUCCEEDED' }), {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    try {
      await expect(
        openAiRequestEvents('123', {
          ...options(),
          onEvent: () => controller.abort(),
          signal: controller.signal,
        }),
      ).resolves.toBeUndefined();
      expect(controller.signal.aborted).toBe(true);
    } finally {
      transport.mockRestore();
    }
  });

  it('blocks demo, missing authentication, invalid IDs and aborted calls before fetch', async () => {
    const transport = vi.spyOn(globalThis, 'fetch');
    try {
      await expect(
        openAiRequestEvents('123', { ...options(), demo: true }),
      ).rejects.toThrow('AI_DISABLED_IN_DEMO');
      await expect(
        openAiRequestEvents('123', { ...options(), authorization: null }),
      ).rejects.toThrow('UNAUTHENTICATED');
      await expect(openAiRequestEvents('../other', options())).rejects.toThrow(
        'INVALID_REQUEST_ID',
      );
      await expect(
        openAiRequestEvents('123', {
          ...options(),
          signal: AbortSignal.abort(),
        }),
      ).rejects.toThrow();
      expect(transport).not.toHaveBeenCalled();
    } finally {
      transport.mockRestore();
    }
  });

  it('uses auth headers, requires explicit terminal, cancels and releases its reader', async () => {
    const cancel = vi.fn();
    const network = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(
          encode(frame('completed', { sequence: 1, status: 'SUCCEEDED' })),
        );
      },
    });
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(network, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    try {
      const config = options();
      await openAiRequestEvents('123', config);
      expect(transport).toHaveBeenCalledOnce();
      expect(transport.mock.calls[0]?.[0]).toBe('/api/ai/requests/123/events');
      expect(transport.mock.calls[0]?.[1]?.headers).toEqual({
        Accept: 'text/event-stream',
        Authorization: 'raw-existing-jwt',
      });
      expect(config.onEvent).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledOnce();
      expect(network.locked).toBe(false);
    } finally {
      transport.mockRestore();
    }
  });

  it('eOF after a delta is incomplete, preserves the delta and never retries', async () => {
    const network = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encode(frame('delta', { sequence: 1, text: 'partial' })),
        );
        controller.close();
      },
    });
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(network, {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );
    try {
      const config = options();
      await expect(openAiRequestEvents('123', config)).rejects.toThrow(
        'STREAM_INCOMPLETE',
      );
      expect(config.onEvent.mock.calls[0]?.[0].text).toBe('partial');
      expect(transport).toHaveBeenCalledOnce();
      expect(network.locked).toBe(false);
    } finally {
      transport.mockRestore();
    }
  });

  it('rejects HTTP and wrong content types without exposing response body', async () => {
    const transport = vi.spyOn(globalThis, 'fetch');
    try {
      transport.mockResolvedValueOnce(
        new Response('secret body', { status: 403 }),
      );
      await expect(openAiRequestEvents('123', options())).rejects.toThrow(
        'AI_HTTP_403',
      );
      transport.mockResolvedValueOnce(
        new Response('secret HTML', {
          headers: { 'Content-Type': 'text/html' },
        }),
      );
      await expect(openAiRequestEvents('123', options())).rejects.toThrow(
        'INVALID_STREAM_RESPONSE',
      );
    } finally {
      transport.mockRestore();
    }
  });
});
