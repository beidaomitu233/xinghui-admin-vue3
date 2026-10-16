import { useAppConfig } from '@vben/hooks';
import { useAccessStore } from '@vben/stores';

import { requestClient } from '#/api/request';

import { openAiRequestEvents } from './ai-runtime-stream';

/** REST Java long values may be decimal strings; SSE keeps its separate numeric contract. */
export type AiRestLong = number | string;

export interface ModelReference {
  configVersion: string;
  modelRef: string;
}
export interface KeyReference {
  keyRef: string;
  keyVersion: string;
}
export interface ModelBinding {
  allowedKeys: KeyReference[];
  fallbackKeys: KeyReference[];
  fixedKey: KeyReference | null;
  keyMode: 'AUTO' | 'FIXED';
  model: ModelReference;
}
export interface ApplicationPolicy {
  allowedAuthorities: string[];
  allowedSubjects: string[];
  formId: null | string;
  inputNames: string[];
  maxAttempts: number;
  maxConcurrent: number;
  maxTokens: number;
  modelFallback: boolean;
  modelMode: 'FIXED' | 'ROUND_ROBIN';
  models: ModelBinding[];
  requirements: {
    outputFormat: 'JSON_OBJECT' | 'TEXT';
    streaming: boolean;
    tools: boolean;
  };
  scope: 'BACKGROUND' | 'BOTH' | 'FRONTEND';
  template: null | { templateId: string; templateVersionId: string };
  timeoutSeconds: number;
}
export interface ApplicationDraft {
  entryKey: string;
  name: string;
  policy: ApplicationPolicy;
  purpose: string;
}
export interface ApplicationView {
  appId: string;
  draft: ApplicationPolicy;
  draftRevision: number;
  enabled: boolean;
  entryKey: string;
  name: string;
  ownerId: string;
  publishedVersionId: null | string;
  purpose: string;
  revision: number;
}
export interface AiPage<T> {
  pageNum: number;
  pageSize: number;
  records: T[];
  total: AiRestLong;
}
export interface ApplicationVersion {
  appId: string;
  appVersionId: string;
  draftRevision: number;
  snapshot: {
    policy: ApplicationPolicy;
    resources: { resourceId: string; resourceVersionId: string }[];
    tests: { model: ModelReference; requestId: string }[];
  };
  versionNumber: number;
}
export interface AvailableModel {
  capabilities: {
    outputFormats: ('JSON_OBJECT' | 'TEXT')[];
    streaming: boolean;
    tools: boolean;
  };
  configId: string;
  configName: string;
  model: ModelReference;
  modelCode: string;
  providerCode: string;
  usableKeyCount: number;
}
export interface ProviderTarget {
  capabilities: AvailableModel['capabilities'];
  key: KeyReference;
  maskedKeyLabel: string;
  model: ModelReference;
  modelCode: string;
  providerCode: string;
}
export interface PublishedTemplateOption {
  available: boolean;
  inputVariables: {
    hasDefault: boolean;
    name: string;
    required: boolean;
    type: 'ARRAY' | 'BOOLEAN' | 'NUMBER' | 'OBJECT' | 'STRING';
  }[];
  name: string;
  resources: { resourceId: string; resourceVersionId: string }[];
  templateId: string;
  templateVersionId: string;
  unavailableReasons: string[];
  versionNumber: number;
}
export type RequestStatus =
  | 'CANCELLED'
  | 'FAILED'
  | 'INCOMPLETE'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'TIMED_OUT';
export interface AiRequestView {
  appId: string;
  appVersionId: null | string;
  attemptCount: number;
  businessId: string;
  businessType: string;
  createdAt: string;
  deadline: string;
  draftRevision: null | number;
  errorCode: null | string;
  finishedAt: null | string;
  inputTokens: AiRestLong | null;
  kind: 'BUSINESS' | 'TEST';
  outputStarted: boolean;
  outputTokens: AiRestLong | null;
  requestId: string;
  stage: string;
  status: RequestStatus;
  usageKnown: boolean;
}
export interface AiInvocationInput {
  businessRef: { id: string; type: string };
  idempotencyKey: string;
  inputs: Record<string, unknown>;
}
export interface ApplicationPreview {
  inputSummary: unknown;
  notices: unknown[];
  originalMessages: { content: string; role: string }[];
  renderedMessages: { content: string; role: string }[];
  resourceSummary: unknown;
  version: { templateId: string; templateVersionId: string };
}

const applications = '/system/ai/applications';

export function listApplications(params: {
  pageNum: number;
  pageSize: number;
  search?: string;
}) {
  return requestClient.get<AiPage<ApplicationView>>(applications, { params });
}
export function getApplication(appId: string) {
  return requestClient.get<ApplicationView>(`${applications}/${appId}`);
}
export function applicationHealth(appId: string) {
  return requestClient.get<{
    appId: string;
    appVersionId: null | string;
    checkedAt: string;
    reason: null | string;
    revision: number;
    state: 'AVAILABLE' | 'DISABLED' | 'UNAVAILABLE' | 'UNPUBLISHED';
  }>(`${applications}/${appId}/health`);
}
export function createApplication(draft: ApplicationDraft) {
  return requestClient.post<string>(applications, draft);
}
export function updateApplicationDraft(
  appId: string,
  revision: number,
  draft: ApplicationDraft,
) {
  return requestClient.put<ApplicationView>(`${applications}/${appId}/draft`, {
    draft,
    revision,
  });
}
export function publishApplication(
  appId: string,
  revision: number,
  testRequestIds: string[],
) {
  return requestClient.post<ApplicationVersion>(
    `${applications}/${appId}/publish`,
    { revision, testRequestIds },
  );
}
export function setApplicationEnabled(
  appId: string,
  revision: number,
  enabled: boolean,
) {
  return requestClient.post<ApplicationView>(
    `${applications}/${appId}/enabled`,
    {
      enabled,
      revision,
    },
  );
}
export function listApplicationVersions(appId: string) {
  return requestClient.get<ApplicationVersion[]>(
    `${applications}/${appId}/versions`,
  );
}
export function rollbackApplication(
  appId: string,
  revision: number,
  appVersionId: string,
) {
  return requestClient.post<ApplicationView>(
    `${applications}/${appId}/rollback`,
    {
      appVersionId,
      revision,
    },
  );
}
export function applicationModels(
  streaming: boolean,
  outputFormat: 'JSON_OBJECT' | 'TEXT',
) {
  return requestClient.get<AvailableModel[]>(`${applications}/options/models`, {
    params: { outputFormat, streaming },
  });
}
export function applicationKeyOptions(model: ModelReference) {
  return requestClient.get<ProviderTarget[]>(`${applications}/options/keys`, {
    params: model,
  });
}
export function applicationTestEvidence(appId: string) {
  return requestClient.get<{ model: ModelReference; requestId: string }[]>(
    `${applications}/${appId}/test-evidence`,
  );
}
export function applicationTemplateOptions(params: {
  appId?: string;
  keyword?: string;
  pageNum: number;
  pageSize: number;
}) {
  return requestClient.get<AiPage<PublishedTemplateOption>>(
    '/system/ai/templates/options',
    { params },
  );
}

export function submitApplicationTest(
  appId: string,
  revision: number,
  modelIndex: number,
  input: AiInvocationInput,
) {
  return requestClient.post<AiRequestView>(
    `${applications}/${appId}/test-requests`,
    {
      ...input,
      modelIndex,
      revision,
    },
  );
}
export function previewApplication(
  appId: string,
  revision: number,
  input: Omit<AiInvocationInput, 'idempotencyKey'>,
) {
  return requestClient.post<ApplicationPreview>(
    `${applications}/${appId}/preview`,
    { ...input, revision },
  );
}
export function recordSummaryApplication(formId: string) {
  return requestClient.get<null | {
    appId: string;
    appVersionId: string;
    name: string;
  }>('/ai/applications/record-summary', { params: { formId } });
}
export function submitApplication(appId: string, input: AiInvocationInput) {
  return requestClient.post<AiRequestView>(
    `/ai/applications/${appId}/requests`,
    input,
  );
}
export function getAiRequest(requestId: string) {
  return requestClient.get<AiRequestView>(`/ai/requests/${requestId}`);
}
export function cancelAiRequest(requestId: string) {
  return requestClient.post<AiRequestView>(`/ai/requests/${requestId}/cancel`);
}
export function subscribeAiRequest(
  requestId: string,
  onEvent: Parameters<typeof openAiRequestEvents>[1]['onEvent'],
  signal: AbortSignal,
) {
  const { apiURL } = useAppConfig(import.meta.env, import.meta.env.PROD);
  return openAiRequestEvents(requestId, {
    apiBase: apiURL,
    authorization: useAccessStore().accessToken,
    demo: import.meta.env.VITE_APP_DEMO === 'true',
    onEvent,
    signal,
  });
}
