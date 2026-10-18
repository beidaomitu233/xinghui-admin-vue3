import type {
  AiRestLong,
  KeyReference,
  ModelBinding,
  ModelReference,
  RequestStatus,
} from './ai-application';
import type { BindingPreview, DatabaseValue, DataBinding } from './ai-database';
import type { QueryBinding } from './ai-query';

import { requestClient } from '#/api/request';

export interface SceneAvailability {
  reasons: string[];
  state: 'DISABLED' | 'READY' | 'UNAVAILABLE' | 'UNCONFIGURED';
}
export interface SceneModelPolicy {
  fallback: boolean;
  maxAttempts: number;
  maxConcurrent: number;
  maxTokens: number;
  mode: 'FIXED' | 'ROUND_ROBIN';
  models: ModelBinding[];
  outputFormat: 'JSON_OBJECT' | 'TEXT';
  timeoutSeconds: number;
}
export interface SceneDefinition {
  sqlBindings?: QueryBinding[];
  initialModel?: ModelReference | null;
  dataBindings?: DataBinding[];
  dataObjects: { fields: string[]; formId: null | string; objectKey: string }[];
  modelPolicy: SceneModelPolicy;
  name: string;
  outputRequirement: string;
  promptText: string;
  purpose: string;
}
export type SceneEditableDefinition = Omit<SceneDefinition, 'modelPolicy'> & {
  modelPolicy?: SceneModelPolicy;
};
export interface SceneEntry {
  canStartFromMonitor?: boolean;
  contextRequired?: boolean;
  contextSourceKey?: null | string;
  contextSourceLabel?: null | string;
  availability: SceneAvailability;
  currentVersionId: null | string;
  formId: null | string;
  kind: 'GENERAL' | 'RECORD_SUMMARY';
  name: string;
  revision: number;
  sceneKey: string;
}
export interface SceneSummary extends SceneEntry {
  enabled: boolean;
  purpose: string;
  source: 'LEGACY_V04' | 'NATIVE';
  updatedAt: string;
}
export interface SceneDetail {
  definition: null | SceneDefinition;
  legacy: null | SceneLegacy;
  scene: SceneSummary;
}
export interface SceneLegacy {
  compatibility: 'CONVERTIBLE' | 'READ_ONLY';
  conversionNotes: string[];
  editor: null | Pick<
    SceneDefinition,
    'dataObjects' | 'outputRequirement' | 'promptText'
  >;
  originalDefinition: Record<string, unknown>;
  originalMessages: { section: string; text: string }[];
  reasons: string[];
  requiresConfirmation: boolean;
}
export interface ScenePage {
  pageNum: number;
  pageSize: number;
  records: SceneSummary[];
  total: string;
}
export interface SceneSaveResult {
  clientMutationId: string;
  detail: SceneDetail;
  effectiveFrom: null | string;
}
export interface SceneCreate {
  clientMutationId: string;
  formId: null | string;
  kind: SceneEntry['kind'];
  name: string;
  purpose: string;
}
export interface SceneModelOption {
  configId: string;
  configName: string;
  model: ModelReference;
  modelCode: string;
  outputFormats: SceneModelPolicy['outputFormat'][];
  providerCode: string;
  streaming: boolean;
  usableKeyCount: number;
}
export interface SceneSubmission {
  businessRef?: null | { id: string; type: string };
  idempotencyKey: string;
  inputs: Record<string, unknown>;
}
export interface SceneRequest {
  assistantMessageId?: null | string;
  conversationId?: null | string;
  userMessageId?: null | string;
  attemptCount: number;
  businessRef: SceneSubmission['businessRef'];
  createdAt: string;
  deadline: string;
  errorCode: null | string;
  finishedAt: null | string;
  inputTokens: AiRestLong | null;
  kind: 'BUSINESS' | 'TEST';
  outputStarted: boolean;
  outputTokens: AiRestLong | null;
  requestId: string;
  sceneKey: string;
  sceneVersionId: string;
  stage: string;
  status: RequestStatus;
  usageKnown: boolean;
}
export interface ScenePreview {
  dataValues?: Record<string, DatabaseValue>;
  reads?: BindingPreview['reads'];
  inputSummary: Record<string, string>;
  notices: string[];
  originalMessages: { content: string; role: string }[];
  renderedMessages: { content: string; role: string }[];
  resourceSummary: Record<string, string>;
  sceneKey: string;
  sceneVersionId: string;
}
export interface SceneMonitor {
  calls: null | {
    businessRequests: number;
    failedAttempts: number;
    failedRequests: number;
    knownInputTokens: AiRestLong | null;
    knownOutputTokens: AiRestLong | null;
    modelAttempts: number;
    requests: number;
    succeededRequests: number;
    testRequests: number;
    unknownInputAttempts: number;
    unknownOutputAttempts: number;
  };
  keyCards: {
    enabledKeyVersions: AiRestLong | null;
    knownAdmittedPairs: AiRestLong | null;
    recentlyFailedKeyVersions: AiRestLong | null;
    unattributedAttempts: AiRestLong | null;
    unavailableReason: null | string;
  };
  observedAt: string;
  requestKind: string;
  scope: 'AUDIT' | 'OWN';
  window: { from: string; to: string };
}

const scenes = '/system/ai/scenes';
const scenePath = (sceneKey: string) =>
  `${scenes}/${encodeURIComponent(sceneKey)}`;
export const getSceneWorkspace = (params: {
  pageNum: number;
  pageSize: number;
  search?: string;
  selectedSceneKey?: string;
}) =>
  requestClient.get<{ scenes: ScenePage; selected: null | SceneDetail }>(
    `${scenes}/workspace`,
    { params },
  );
export const getScene = (sceneKey: string) =>
  requestClient.get<SceneDetail>(scenePath(sceneKey));
export const createScene = (input: SceneCreate) =>
  requestClient.post<SceneDetail>(scenes, input);
export const saveScene = (
  sceneKey: string,
  input: {
    clientMutationId: string;
    confirmedLegacyConversion?: boolean;
    definition: SceneEditableDefinition;
    expectedRevision: number;
  },
) => requestClient.put<SceneSaveResult>(scenePath(sceneKey), input);
export const setSceneEnabled = (
  sceneKey: string,
  input: {
    clientMutationId: string;
    enabled: boolean;
    expectedRevision: number;
  },
) =>
  requestClient.post<SceneSaveResult>(`${scenePath(sceneKey)}/enabled`, input);
export const sceneModels = (outputFormat: SceneModelPolicy['outputFormat']) =>
  requestClient.get<SceneModelOption[]>(`${scenes}/options/models`, {
    params: { outputFormat },
  });
export const sceneKeys = (model: ModelReference) =>
  requestClient.get<{ key: KeyReference; maskedLabel: string }[]>(
    `${scenes}/options/keys`,
    { params: model },
  );
export const previewScene = (
  sceneKey: string,
  input: {
    businessRef: SceneSubmission['businessRef'];
    expectedRevision: number;
    inputs: Record<string, unknown>;
  },
) => requestClient.post<ScenePreview>(`${scenePath(sceneKey)}/preview`, input);
export const testScene = (
  sceneKey: string,
  input: {
    confirmedCosts: true;
    expectedRevision: number;
    modelIndex: number;
    submission: SceneSubmission;
  },
) =>
  requestClient.post<SceneRequest>(
    `${scenePath(sceneKey)}/test-requests`,
    input,
  );
export const recordSummaryScene = (formId: string) =>
  requestClient.get<null | SceneEntry>('/ai/scenes/record-summary', {
    params: { formId },
  });
export const sceneEntries = () => requestClient.get<SceneEntry[]>('/ai/scenes');
export const submitScene = (sceneKey: string, input: SceneSubmission) =>
  requestClient.post<SceneRequest>(
    `/ai/scenes/${encodeURIComponent(sceneKey)}/requests`,
    input,
  );
export const getSceneRequest = (requestId: string) =>
  requestClient.get<SceneRequest>(
    `/ai/scenes/requests/${encodeURIComponent(requestId)}`,
  );
export const cancelSceneRequest = (requestId: string) =>
  requestClient.post<SceneRequest>(
    `/ai/scenes/requests/${encodeURIComponent(requestId)}/cancel`,
  );
export const getSceneMonitor = (params: {
  from?: string;
  modelRef?: string;
  requestKind?: 'BUSINESS' | 'TEST';
  result?: string;
  sceneKey?: string;
  scope: 'AUDIT' | 'OWN';
  to?: string;
}) => requestClient.get<SceneMonitor>('/system/ai/monitor/summary', { params });
