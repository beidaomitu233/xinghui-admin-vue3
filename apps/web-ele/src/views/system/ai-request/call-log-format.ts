import type { CallLogRow } from '#/api/system/ai-call-log';

export const exact = (
  value: null | number | string | undefined,
  missing = '未采集',
) => (value === null || value === undefined ? missing : String(value));
export const entryLabels = {
  CONFIGURATION_TEST: '连接测试',
  MODEL_DISCOVERY: '模型目录扫描',
  REQUEST_ATTEMPT: '模型调用',
};
export const statusLabels: Record<string, string> = {
  QUEUED: '排队中',
  RUNNING: '进行中',
  SUCCEEDED: '成功',
  FAILED: '失败',
  CANCELLED: '已取消',
  INCOMPLETE: '未完成',
  TIMED_OUT: '超时',
};
export function tokenValue(call: CallLogRow, value: null | number | string) {
  if (call.entryType === 'MODEL_DISCOVERY') return '不适用';
  return exact(value);
}
export function outputTime(call: CallLogRow, value = call.firstOutputMs) {
  if (call.entryType === 'MODEL_DISCOVERY') return '不适用';
  if (call.streaming === false) return '不可测';
  return value === null ? '未采集' : `${exact(value)} ms`;
}
export function costValue(call: CallLogRow) {
  if (call.reportedCost === null) return '未提供';
  return `${call.reportedCost} ${call.currency ?? '币种未提供'}`;
}
const exportFields = [
  'callId',
  'requestId',
  'attemptId',
  'configurationTestId',
  'configurationPairId',
  'entryType',
  'requestKind',
  'sceneKey',
  'appId',
  'appName',
  'tenantRef',
  'subjectRef',
  'modelRef',
  'modelCode',
  'returnedModel',
  'providerCode',
  'configName',
  'maskedKeyLabel',
  'attemptNumber',
  'switchReason',
  'status',
  'errorCode',
  'httpStatus',
  'startedAt',
  'finishedAt',
  'streaming',
  'elapsedMs',
  'responseHeadersMs',
  'firstByteMs',
  'firstOutputMs',
  'firstTextMs',
  'lastOutputMs',
  'firstOutputKind',
  'finishReason',
  'providerRequestId',
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'reasoningTokens',
  'reportedCost',
  'currency',
  'captureStatus',
  'captureReason',
  'redacted',
  'truncated',
  'responseAvailable',
] as const satisfies readonly (keyof CallLogRow)[];
// Export the row contract only; never propagate a mistakenly attached detail/body.
export function structuredRows(rows: CallLogRow[]) {
  return rows
    .slice(0, 5000)
    .map((row) =>
      Object.fromEntries(exportFields.map((field) => [field, row[field]])),
    );
}

// Format token boundaries only: never parse number lexemes through JavaScript Number.
// Invalid/truncated JSON and SSE remain the exact archived text.
export function responseText(body: string, format: string) {
  if (format !== 'JSON') return body;
  try {
    JSON.parse(body);
  } catch {
    return body;
  }
  let result = '';
  let depth = 0;
  let quoted = false;
  let escaped = false;
  // Keep indentation bounded even for an unusually deep valid provider extension.
  const newline = () => `\n${'  '.repeat(Math.min(depth, 16))}`;
  for (const char of body) {
    if (quoted) {
      result += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    switch (char) {
      case '"': {
        quoted = true;
        result += char;
        break;
      }
      case ',': {
        result += char + newline();
        break;
      }
      case ':': {
        result += ': ';
        break;
      }
      case '[':
      case '{': {
        depth++;
        result += char + newline();
        break;
      }
      case ']':
      case '}': {
        depth--;
        result += newline() + char;
        break;
      }
      default: {
        if (!/\s/.test(char)) result += char;
      }
    }
  }
  return result;
}
