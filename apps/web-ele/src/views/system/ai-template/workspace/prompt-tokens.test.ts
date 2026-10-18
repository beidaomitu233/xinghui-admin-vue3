import { describe, expect, it } from 'vitest';

import { promptSegments, variableToken } from './prompt-tokens';

describe('stable prompt token identity', () => {
  it('inserts bilingual English identities while retaining legacy Chinese and dotted identities', () => {
    expect(variableToken({ name: 'order_summary', label: '订单汇总' })).toBe(
      '{{order_summary:订单汇总}}',
    );
    expect(variableToken({ name: 'user_request', label: '用户要求' })).toBe(
      '{{user_request:用户要求}}',
    );
    expect(variableToken({ name: '订单', label: '原订单' })).toBe('{{订单}}');
    expect(variableToken({ name: 'order.name', label: '客户名称' })).toBe(
      '{{order.name}}',
    );
  });
  it('highlights whole old and new tokens without interpreting or altering surrounding input', () => {
    const text =
      '按 {{order_summary:订单汇总}} 回答 {{订单}}，保留 <b>文字</b> 与 {{missing}}';
    const segments = promptSegments(text, [
      { name: 'order_summary', label: '订单汇总' },
      { name: '订单', label: '原订单' },
    ]);
    expect(segments.map((segment) => segment.text).join('')).toBe(text);
    expect(
      segments
        .filter((segment) => segment.variable && segment.known)
        .map((segment) => segment.text),
    ).toEqual(['{{order_summary:订单汇总}}', '{{订单}}']);
    expect(
      segments.find((segment) => segment.text === '{{missing}}')?.known,
    ).toBe(false);
  });
});
