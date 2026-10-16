import { describe, expect, it } from 'vitest';

import { safeContentUrl } from './content-validation';

describe('content URL policy', () => {
  it('rejects every C0 control character and DEL inside a URL', () => {
    for (const code of [
      ...Array.from({ length: 32 }, (_, index) => index),
      127,
    ]) {
      expect(safeContentUrl(`/content/a${String.fromCodePoint(code)}b`)).toBe(
        false,
      );
    }
  });

  it('retains Unicode content paths and ordinary HTTPS URLs', () => {
    expect(safeContentUrl('/content/文档😀')).toBe(true);
    expect(safeContentUrl('https://example.com/content')).toBe(true);
  });
});
