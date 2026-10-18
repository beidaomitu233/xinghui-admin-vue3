import { requestClient } from '#/api/request';

export interface HubRouteHealth {
  ready: boolean;
  reasons: string[];
  providerCode: null | string;
  channelName: null | string;
}
export interface HubModelRoute {
  routeId: string;
  channelId: string;
  upstreamModel: string;
  enabled: boolean;
  health: HubRouteHealth;
}
export interface HubModel {
  modelId: string;
  revision: number;
  name: string;
  slug: string;
  capabilities: string;
  contextWindow: string;
  enabled: boolean;
  strategy: 'PRIORITY' | 'ROUND_ROBIN';
  fallback: boolean;
  routes: HubModelRoute[];
  health: {
    distinctProviders: number;
    multiProviderProtected: boolean;
    ready: boolean;
    readyRoutes: number;
    reasons: string[];
  };
  updatedAt: string;
}
export interface HubModelChange {
  clientMutationId: string;
  expectedRevision?: number;
  name: string;
  slug: string;
  capabilities: string;
  contextWindow: string;
  enabled: boolean;
  strategy: HubModel['strategy'];
  fallback: boolean;
  routes: {
    channelId: string;
    enabled: boolean;
    routeId?: string;
    upstreamModel: string;
  }[];
}
export interface HubModelPage {
  records: HubModel[];
  total: string;
  pageNum: number;
  pageSize: number;
}
export interface HubModelSummary {
  totalModels: number;
  enabledModels: number;
  readyModels: number;
  unconfiguredModels: number;
  disabledModels: number;
  multiProviderModels: number;
  assuranceNeededModels: number;
  modelLimit: number;
  observedAt: string;
}
export interface HubModelTest {
  requestId: string;
  status: string;
  errorCode: null | string;
  attemptCount: number;
  deadline: null | string;
  attempts: {
    elapsedMs: null | number;
    errorCode: null | string;
    number: number;
    providerCode: null | string;
    status: string;
    switchReason: string;
    upstreamModel: null | string;
  }[];
}
const base = '/system/ai/settings/model-hub/models';
export const getHubModelSummary = () =>
  requestClient.get<HubModelSummary>(`${base}/summary`);
export const listHubModels = (params: {
  pageNum: number;
  pageSize: number;
  search?: string;
}) => requestClient.get<HubModelPage>(base, { params });
export const getHubModel = (modelId: string) =>
  requestClient.get<HubModel>(`${base}/${encodeURIComponent(modelId)}`);
export const createHubModel = (input: HubModelChange) =>
  requestClient.post<HubModel>(base, input);
export const updateHubModel = (modelId: string, input: HubModelChange) =>
  requestClient.put<HubModel>(`${base}/${encodeURIComponent(modelId)}`, input);
export const deleteHubModel = (modelId: string, expectedRevision: number) =>
  requestClient.delete(`${base}/${encodeURIComponent(modelId)}`, {
    params: { expectedRevision },
  });
export const setHubModelEnabled = (
  modelId: string,
  input: {
    clientMutationId: string;
    enabled: boolean;
    expectedRevision: number;
  },
) =>
  requestClient.post<HubModel>(
    `${base}/${encodeURIComponent(modelId)}/enabled`,
    input,
  );
export const startHubModelTest = (
  modelId: string,
  input: {
    clientMutationId: string;
    confirmedCosts: boolean;
    expectedRevision: number;
  },
) =>
  requestClient.post<HubModelTest>(
    `${base}/${encodeURIComponent(modelId)}/tests`,
    input,
  );
export const getHubModelTest = (modelId: string, requestId: string) =>
  requestClient.get<HubModelTest>(
    `${base}/${encodeURIComponent(modelId)}/tests/${encodeURIComponent(requestId)}`,
  );
export const cancelHubModelTest = (modelId: string, requestId: string) => requestClient.post<HubModelTest>(`${base}/${encodeURIComponent(modelId)}/tests/${encodeURIComponent(requestId)}/cancel`, {});
