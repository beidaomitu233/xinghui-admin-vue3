import type { AiRestLong } from './ai-application';

import { requestClient } from '#/api/request';

export interface AiModelConfig {
  id: AiRestLong;
  providerCode: string;
  modelCode: string;
  endpointUrl: string;
  /** Environment variable name only. The server never returns its value. */
  credentialEnvName: null | string;
  credentialMode: 'DB' | 'ENV';
  credentialConfigured: boolean;
  timeoutSeconds: number;
  enabled: boolean;
  revision: number;
  createTime: string;
  updateTime: string;
}

export interface AiModelPage {
  records: AiModelConfig[];
  total: number | string;
  pageNum: number;
  pageSize: number;
}

export interface AiModelFilters {
  orderBy?: string;
  order?: 'asc' | 'desc';
  pageNum: number;
  pageSize: number;
  providerCode?: string;
  modelCode?: string;
  enabled?: boolean;
}

export interface AiModelChange {
  providerCode: string;
  modelCode: string;
  endpointUrl: string;
  credentialEnvName: null | string;
  timeoutSeconds: number;
  enabled: boolean;
}

export const listAiModels = (params: AiModelFilters) =>
  requestClient.get<AiModelPage>('/system/ai/models', { params });

export const getAiModel = (id: AiRestLong) =>
  requestClient.get<AiModelConfig>(`/system/ai/models/${id}`);

export const createAiModel = (data: AiModelChange) =>
  requestClient.post<AiRestLong>('/system/ai/models', data);

export const updateAiModel = (
  id: AiRestLong,
  data: AiModelChange & { revision: number },
) => requestClient.put<AiModelConfig>(`/system/ai/models/${id}`, data);

export const setAiModelEnabled = (
  id: AiRestLong,
  data: { enabled: boolean; revision: number },
) =>
  requestClient.request<AiModelConfig>(`/system/ai/models/${id}/status`, {
    data,
    method: 'PATCH',
  });

export const removeAiModel = (id: AiRestLong, revision: number) =>
  requestClient.delete<undefined>(`/system/ai/models/${id}`, {
    params: { revision },
  });

export interface ModelTestResult {
  outcome: string;
  model: string;
  returnedModel: null | string;
  elapsedMs: number | string;
  httpStatus: null | number;
  content: null | string;
  providerId: null | string;
  message: string;
}
export const saveAiModelCredential = (
  id: AiRestLong,
  data: {
    apiKey: string;
    clearKey: boolean;
    mode: 'DB' | 'ENV';
    revision: number;
  },
) =>
  requestClient.put<AiModelConfig>(`/system/ai/models/${id}/credential`, data);
export const testAiModel = (id: AiRestLong) =>
  requestClient.post<ModelTestResult>(`/system/ai/models/${id}/test`);
