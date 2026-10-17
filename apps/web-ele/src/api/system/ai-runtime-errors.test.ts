import { describe, expect, it } from 'vitest';

import { aiErrorMessage, aiFailureInfo } from './ai-runtime-errors';

describe('ai safe failure metadata', () => {
  it('translates the required-input preview failure into a short Chinese message', () => {
    const failure = aiFailureInfo({
      response: { data: { message: 'MISSING_VARIABLE' } },
    });
    expect(aiErrorMessage(failure.code)).toBe('缺少必填输入。');
  });
  it('keeps long decimal ids as strings and accepts server admission UUID traces', () => {
    expect(
      aiFailureInfo({
        response: {
          headers: { 'x-request-id': '9007199254740993' },
          data: { message: 'RESOURCE_FORBIDDEN' },
        },
      }),
    ).toEqual({ requestId: '9007199254740993', code: 'RESOURCE_FORBIDDEN' });
    expect(
      aiFailureInfo({
        response: {
          headers: new Headers({
            'X-Request-ID': '0e925dce-e78b-442e-9bf0-5ea7b019508b',
          }),
        },
      }).requestId,
    ).toBe('0e925dce-e78b-442e-9bf0-5ea7b019508b');
  });
  it('does not display raw provider bodies, malformed trace headers or inherited message fields', () => {
    for (const trace of [
      'forged\ntrace',
      '9999999999999999999',
      9_007_199_254_740_992,
      '<script>',
    ]) {
      expect(
        aiFailureInfo({
          response: {
            headers: { 'x-request-id': trace },
            data: { message: 'secret provider response' },
          },
        }),
      ).toEqual({ requestId: undefined, code: undefined });
    }
    expect(aiErrorMessage('secret provider response')).not.toContain('secret');
    expect(typeof aiErrorMessage('toString')).toBe('string');
    expect(
      aiFailureInfo({ response: { data: { message: 'toString' } } }).code,
    ).toBeUndefined();
  });
});
