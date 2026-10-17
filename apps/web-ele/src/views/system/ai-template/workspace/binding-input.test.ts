import { describe, expect, it } from 'vitest';

import { bindingFilters, bindingVariable } from './binding-input';

describe('frozen database binding input rules', () => {
  it.each(['2026订单', '.金额', '订单'.repeat(65), 'user_request'])(
    'keeps %s labels usable without producing an invalid or reserved variable',
    (label) => {
      const variable = bindingVariable(label, []);
      expect(variable).toMatch(/^[\p{L}_][\p{L}\p{N}_.]{0,63}$/u);
      expect(variable).not.toBe('user_request');
    },
  );
  it('reserves room for collision suffixes on a maximum length Unicode alias', () => {
    const label = '订'.repeat(65);
    const existing = [bindingVariable(label, [])];
    for (let count = 0; count < 12; count++)
      existing.push(bindingVariable(label, existing));
    expect(new Set(existing).size).toBe(13);
    for (const variable of existing)
      expect(variable).toMatch(/^[\p{L}_][\p{L}\p{N}_.]{0,63}$/u);
    expect(existing.at(-1)).toMatch(/_13$/);
  });
  it('never carries table filters into fixed record or field bindings', () => {
    const filters = [
      {
        field: 'amount',
        operator: 'GT' as const,
        value: '123456789012345678.123',
      },
    ];
    expect(bindingFilters('FIELD', filters)).toEqual([]);
    expect(bindingFilters('ROW', filters)).toEqual([]);
    expect(bindingFilters('TABLE', filters)).toEqual(filters);
    expect(bindingFilters('CHILDREN', filters)).toEqual(filters);
    expect(filters[0]?.value).toBe('123456789012345678.123');
  });
});
