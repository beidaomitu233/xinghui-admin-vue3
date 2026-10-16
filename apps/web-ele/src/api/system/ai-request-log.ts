import type {
  AiPage,
  AiRequestView,
  AiRestLong,
  RequestStatus,
} from './ai-application';

import { requestClient } from '#/api/request';

export interface RequestLogFilters {
  appId?: string;
  businessId?: string;
  from?: string;
  modelRef?: string;
  requestId?: string;
  scope: 'AUDIT' | 'OWN';
  status?: RequestStatus;
  subjectRef?: string;
  tenantRef?: string;
  to?: string;
}
export interface RequestLogRow {
  appName: string;
  elapsedMs: AiRestLong;
  request: AiRequestView;
  subjectRef: string;
  tenantRef: string;
}
export interface RequestAttempt {
  attemptId: string;
  configVersion: string;
  createdAt: string;
  errorCode: null | string;
  finishedAt: null | string;
  inputTokens: AiRestLong | null;
  keyRef: string;
  keyVersion: null | string;
  maskedKeyLabel: string;
  modelCode: null | string;
  modelRef: string;
  number: number;
  outputTokenLimit: null | number;
  outputTokens: AiRestLong | null;
  providerCode: null | string;
  providerRequestId: null | string;
  status: RequestStatus;
  switchReason: string;
}
export interface RequestStage {
  createdAt: string;
  errorCode: null | string;
  outcome: string;
  referenceId: null | string;
  referenceKind: null | string;
  referenceVersion: null | string;
  stage: string;
  stageId: string;
}
export interface RequestLogDetail {
  attempts: RequestAttempt[];
  request: RequestLogRow;
  stages: RequestStage[];
}
export interface RequestLogStatistics {
  businessRequests: AiRestLong;
  knownInputTokens: AiRestLong | null;
  knownOutputTokens: AiRestLong | null;
  modelAttempts: AiRestLong;
  requests: AiRestLong;
  testRequests: AiRestLong;
  unknownInputAttempts: AiRestLong;
  unknownOutputAttempts: AiRestLong;
}
const base = '/system/ai/requests';
export function listRequestLogs(
  params: RequestLogFilters & { pageNum: number; pageSize: number },
) {
  return requestClient.get<AiPage<RequestLogRow>>(base, { params });
}
export function getRequestLog(requestId: string, params: RequestLogFilters) {
  return requestClient.get<RequestLogDetail>(`${base}/${requestId}`, {
    params,
  });
}
export function requestLogStatistics(params: RequestLogFilters) {
  return requestClient.get<RequestLogStatistics>(`${base}/statistics`, {
    params,
  });
}
export function exportRequestLogs(params: RequestLogFilters) {
  return requestClient.get<RequestLogRow[]>(`${base}/export`, { params });
}
