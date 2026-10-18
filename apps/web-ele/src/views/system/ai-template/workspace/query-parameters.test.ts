import { describe, expect, it } from 'vitest';

import { queryParameterText, readQueryParameters } from './query-parameters';

describe('exact SQL business parameter encoding', () => {
  it('preserves raw long integers and decimal lexemes before parsing while leaving business text unchanged', () => {
    expect(
      readQueryParameters(
        '{"id":9007199254740993123,"amount":1234567890.123456789,"code":"00123","enabled":true,"empty":null}',
      ),
    ).toEqual({
      id: { $number: '9007199254740993123' },
      amount: { $number: '1234567890.123456789' },
      code: '00123',
      enabled: true,
      empty: null,
    });
    const quoted = JSON.stringify({ text: 'escaped "19.123"' });
    expect(
      readQueryParameters(`${quoted.slice(0, -1)},"items":[1,-0.25,1e30]}`),
    ).toEqual({
      text: 'escaped "19.123"',
      items: [{ $number: '1' }, { $number: '-0.25' }, { $number: '1e30' }],
    });
  });
  it('round-trips the server envelope without guessing numeric strings and rejects already unsafe JavaScript numbers', () => {
    const value = {
      id: { $number: '9007199254740993123' },
      code: '00123',
      amount: { $number: '0.1000000000000000001' },
    };
    expect(readQueryParameters(queryParameterText(value))).toEqual(value);
    expect(() =>
      queryParameterText({ unsafe: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow();
    expect(() => queryParameterText({ unsafe: 0.123_456_789 })).toThrow();
    expect(() => readQueryParameters('[1,2]')).toThrow();
  });
});
