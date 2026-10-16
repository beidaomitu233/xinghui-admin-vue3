import { describe, expect, it } from 'vitest';

import { formatFileSize } from './file-size';

describe('file size display', () => {
  it('accepts the backend Long string without crashing', () => {
    expect(formatFileSize('39')).toBe('39.00 B');
    expect(formatFileSize('1024')).toBe('1.00 KB');
    expect(formatFileSize('0')).toBe('0 B');
  });

  it('displays a safe placeholder for malformed or unsafe values', () => {
    expect(formatFileSize(undefined)).toBe('—');
    expect(formatFileSize(null)).toBe('—');
    expect(formatFileSize('-1')).toBe('—');
    expect(formatFileSize('oops')).toBe('—');
    expect(formatFileSize('9007199254740993')).toBe('—');
  });
});
