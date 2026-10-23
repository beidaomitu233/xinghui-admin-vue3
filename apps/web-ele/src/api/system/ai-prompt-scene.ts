import type { AiRestLong } from './ai-application';

import { requestClient } from '#/api/request';

export type PromptVariableType = 'BOOLEAN' | 'NUMBER' | 'STRING';

export interface PromptVariable {
  name: string;
  type: PromptVariableType;
  description: string;
  sensitive: boolean;
  exampleValue: string;
}

export interface PromptModelOption {
  id: AiRestLong;
  providerCode: string;
  modelCode: string;
}

export interface PromptSceneSummary {
  id: AiRestLong;
  appKey: string;
  sceneKey: string;
  draftModelId: AiRestLong;
  draftProviderCode: string;
  draftModelCode: string;
  draftModelEnabled: boolean;
  publishedModelId: AiRestLong | null;
  publishedProviderCode: null | string;
  publishedModelCode: null | string;
  publishedModelEnabled: boolean;
  published: boolean;
  draftRevision: number;
  publishedRevision: null | number;
  enabled: boolean;
  revision: number;
  updateTime: string;
}

export interface PromptScenePage {
  records: PromptSceneSummary[];
  total: number | string;
  pageNum: number;
  pageSize: number;
}

export interface PromptSceneView extends PromptSceneSummary {
  draftPrompt: string;
  draftVariables: PromptVariable[];
  publishedPrompt: null | string;
  publishedVariables: PromptVariable[];
  createTime: string;
}

export interface PromptSceneFilters {
  orderBy?: string;
  order?: 'asc' | 'desc';
  pageNum: number;
  pageSize: number;
  appKey?: string;
  sceneKey?: string;
  enabled?: boolean;
  published?: boolean;
}

export interface PromptSceneDraft {
  modelId: AiRestLong;
  prompt: string;
  variables: PromptVariable[];
}

export interface PromptSceneCreate extends PromptSceneDraft {
  appKey: string;
  sceneKey: string;
}

export interface PromptPreview {
  prompt: string;
  modelId: AiRestLong;
  providerCode: string;
  modelCode: string;
  draftRevision: number;
}

export const listPromptScenes = (params: PromptSceneFilters) =>
  requestClient.get<PromptScenePage>('/system/ai/prompts', { params });

export const listPromptSceneModels = () =>
  requestClient.get<PromptModelOption[]>('/system/ai/prompts/models');

export const getPromptScene = (id: AiRestLong) =>
  requestClient.get<PromptSceneView>(`/system/ai/prompts/${id}`);

export const createPromptScene = (data: PromptSceneCreate) =>
  requestClient.post<AiRestLong>('/system/ai/prompts', data);

export const updatePromptSceneDraft = (
  id: AiRestLong,
  data: PromptSceneDraft & { revision: number },
) => requestClient.put<PromptSceneView>(`/system/ai/prompts/${id}/draft`, data);

export const previewPromptScene = (
  id: AiRestLong,
  data: { revision: number; values: Record<string, string> },
) =>
  requestClient.post<PromptPreview>(`/system/ai/prompts/${id}/preview`, data);

export const publishPromptScene = (id: AiRestLong, revision: number) =>
  requestClient.post<PromptSceneView>(`/system/ai/prompts/${id}/publish`, {
    revision,
  });

export const setPromptSceneEnabled = (
  id: AiRestLong,
  data: { enabled: boolean; revision: number },
) =>
  requestClient.request<PromptSceneView>(`/system/ai/prompts/${id}/enabled`, {
    data,
    method: 'PATCH',
  });

export const removePromptScene = (id: AiRestLong, revision: number) =>
  requestClient.delete<undefined>(`/system/ai/prompts/${id}`, {
    params: { revision },
  });
