import type { AiPage, AiRestLong } from './ai-application';

import { requestClient } from '#/api/request';

export type CallEntryType =
  | 'CONFIGURATION_TEST'
  | 'MODEL_DISCOVERY'
  | 'REQUEST_ATTEMPT';
export interface CallLogFilters {
  scope: 'AUDIT' | 'OWN';
  from?: string;
  to?: string;
  requestId?: string;
  modelRef?: string;
  providerCode?: string;
  status?: string;
  entryType?: CallEntryType;
  tenantRef?: string;
  subjectRef?: string;
  appId?: string;
  sceneKey?: string;
}
export interface CallLogRow {
  callId: string;
  requestId: null | string;
  attemptId: null | string;
  configurationTestId: null | string;
  configurationPairId: null | string;
  entryType: CallEntryType;
  requestKind: null | string;
  sceneKey: null | string;
  appId: null | string;
  appName: null | string;
  tenantRef: string;
  subjectRef: string;
  modelRef: null | string;
  modelCode: null | string;
  returnedModel: null | string;
  providerCode: null | string;
  configName: null | string;
  maskedKeyLabel: null | string;
  attemptNumber: null | number | string;
  switchReason: null | string;
  status: string;
  errorCode: null | string;
  httpStatus: AiRestLong | null;
  startedAt: string;
  finishedAt: null | string;
  streaming: boolean | null;
  elapsedMs: AiRestLong | null;
  responseHeadersMs: AiRestLong | null;
  firstByteMs: AiRestLong | null;
  firstOutputMs: AiRestLong | null;
  firstTextMs: AiRestLong | null;
  lastOutputMs: AiRestLong | null;
  firstOutputKind: null | string;
  finishReason: null | string;
  providerRequestId: null | string;
  inputTokens: AiRestLong | null;
  outputTokens: AiRestLong | null;
  totalTokens: AiRestLong | null;
  cacheReadTokens: AiRestLong | null;
  cacheWriteTokens: AiRestLong | null;
  reasoningTokens: AiRestLong | null;
  reportedCost: null | string;
  currency: null | string;
  captureStatus: 'COMPLETE' | 'FAILED' | 'NOT_CAPTURED' | 'PARTIAL';
  captureReason: null | string;
  redacted: boolean;
  truncated: boolean;
  responseAvailable: boolean;
}
export interface CallLogResponse {
  format: 'JSON' | 'SSE' | 'TEXT';
  body: null | string;
  headers: null | Record<string, unknown>;
  usage: null | Record<string, unknown>;
  receivedBytes: AiRestLong;
  archivedBytes: AiRestLong;
}
export interface CallLogDetail {
  call: CallLogRow;
  response: CallLogResponse | null;
}
export interface CallLogStatistics {
  calls: AiRestLong;
  succeeded: AiRestLong;
  failed: AiRestLong;
  knownInputTokens: AiRestLong | null;
  knownOutputTokens: AiRestLong | null;
  unknownInputCalls: AiRestLong;
  unknownOutputCalls: AiRestLong;
}
const base = '/system/ai/call-logs';
export const listCallLogs = (
  params: CallLogFilters & {
    order?: 'asc' | 'desc';
    orderBy?: string;
    pageNum: number;
    pageSize: number;
  },
) => requestClient.get<AiPage<CallLogRow>>(base, { params });
export const callLogStatistics = (params: CallLogFilters) =>
  requestClient.get<CallLogStatistics>(`${base}/statistics`, { params });
export const getCallLog = (callId: string, params: CallLogFilters) =>
  requestClient.get<CallLogDetail>(`${base}/${encodeURIComponent(callId)}`, {
    params,
  });
export const exportCallLogs = (params: CallLogFilters) =>
  requestClient.get<CallLogRow[]>(`${base}/export`, { params });
