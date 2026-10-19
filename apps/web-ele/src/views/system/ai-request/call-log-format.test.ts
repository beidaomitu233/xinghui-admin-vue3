import { describe, expect, it } from 'vitest';

import { localDateTime, responseText } from './call-log-format';

describe('call log presentation formats', () => {
  it('shows local time with milliseconds across offsets and date boundaries', () => {
    expect(localDateTime('2026-10-19T02:54:12.007Z', 'Asia/Shanghai')).toBe(
      '2026-10-19 10:54:12.007',
    );
    expect(localDateTime('2026-10-18T18:54:12.123Z', 'Asia/Shanghai')).toBe(
      '2026-10-19 02:54:12.123',
    );
    expect(localDateTime('2026-10-19T10:54:12+08:00', 'UTC')).toBe(
      '2026-10-19 02:54:12.000',
    );
    expect(localDateTime(null)).toBe('未提供');
    expect(localDateTime('invalid')).toBe('invalid');
  });
  it('formats archived SSE JSON events without changing order or numeric lexemes', () => {
    const body =
      '[{"receivedAt":"first","n":9007199254740993123,"cost":0.0000000000000000123},{"receivedAt":"second","data":"a,b{}"}]';
    const formatted = responseText(body, 'SSE');
    expect(formatted).toContain('\n');
    expect(formatted.indexOf('first')).toBeLessThan(
      formatted.indexOf('second'),
    );
    expect(formatted).toContain('9007199254740993123');
    expect(formatted).toContain('0.0000000000000000123');
    expect(formatted).toContain('"a,b{}"');
    expect(JSON.parse(formatted)).toEqual(JSON.parse(body));
  });
  it('preserves raw, incomplete SSE and plain text byte for byte', () => {
    for (const body of [
      'event: delta\ndata: {"x":1}\n\ndata: [DONE]\n',
      '[{"x":',
      'data: bad',
    ]) {
      expect(responseText(body, 'SSE')).toBe(body);
    }
    expect(responseText('{"x":1}', 'TEXT')).toBe('{"x":1}');
  });
});
