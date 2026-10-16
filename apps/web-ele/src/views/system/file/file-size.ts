export function formatFileSize(value: null | number | string | undefined) {
  if (
    (typeof value === 'string' && !/^\d+$/.test(value)) ||
    (typeof value !== 'string' && typeof value !== 'number')
  ) {
    return '—';
  }

  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}
