import type { BindingMode, DataFilter } from '#/api/system/ai-database';

/** Same Unicode alphabet and 64-code-point bound as DatabaseBindingReader.compile. */
export function bindingVariable(label: string, existing: string[]): string {
  let base = label.replaceAll(/[^\p{L}\p{N}_.]/gu, '_') || '数据引用';
  if (!/^[\p{L}_]/u.test(base) || base === 'user_request')
    base = `数据_${base}`;
  const points = [...base];
  const used = new Set(['user_request', ...existing]);
  let suffix = '';
  let counter = 1;
  let candidate = points.slice(0, 64).join('');
  while (used.has(candidate)) {
    suffix = `_${++counter}`;
    candidate = points.slice(0, 64 - suffix.length).join('') + suffix;
  }
  return candidate;
}
export function bindingFilters(
  mode: BindingMode,
  filters: DataFilter[],
): DataFilter[] {
  return mode === 'TABLE' || mode === 'CHILDREN'
    ? filters.map((filter) => ({ ...filter }))
    : [];
}
