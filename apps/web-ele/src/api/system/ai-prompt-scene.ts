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
  id: number;
  providerCode: string;
  modelCode: string;
}

export interface PromptSceneSummary {
  id: number;
  appKey: string;
  sceneKey: string;
  draftModelId: number;
  draftProviderCode: string;
  draftModelCode: string;
  draftModelEnabled: boolean;
  publishedModelId: null | number;
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
  pageNum: number;
  pageSize: number;
  appKey?: string;
  sceneKey?: string;
  enabled?: boolean;
  published?: boolean;
}

export interface PromptSceneDraft {
  modelId: number;
  prompt: string;
  variables: PromptVariable[];
}

export interface PromptSceneCreate extends PromptSceneDraft {
  appKey: string;
  sceneKey: string;
}

export interface PromptPreview {
  prompt: string;
  modelId: number;
  providerCode: string;
  modelCode: string;
  draftRevision: number;
}

export const listPromptScenes = (params: PromptSceneFilters) =>
  requestClient.get<PromptScenePage>('/system/ai/prompts', { params });

export const listPromptSceneModels = () =>
  requestClient.get<PromptModelOption[]>('/system/ai/prompts/models');

export const getPromptScene = (id: number) =>
  requestClient.get<PromptSceneView>(`/system/ai/prompts/${id}`);

export const createPromptScene = (data: PromptSceneCreate) =>
  requestClient.post<number>('/system/ai/prompts', data);

export const updatePromptSceneDraft = (
  id: number,
  data: PromptSceneDraft & { revision: number },
) => requestClient.put<PromptSceneView>(`/system/ai/prompts/${id}/draft`, data);

export const previewPromptScene = (
  id: number,
  data: { revision: number; values: Record<string, string> },
) =>
  requestClient.post<PromptPreview>(`/system/ai/prompts/${id}/preview`, data);

export const publishPromptScene = (id: number, revision: number) =>
  requestClient.post<PromptSceneView>(`/system/ai/prompts/${id}/publish`, {
    revision,
  });

export const setPromptSceneEnabled = (
  id: number,
  data: { enabled: boolean; revision: number },
) =>
  requestClient.request<PromptSceneView>(`/system/ai/prompts/${id}/enabled`, {
    data,
    method: 'PATCH',
  });

export const removePromptScene = (id: number, revision: number) =>
  requestClient.delete<undefined>(`/system/ai/prompts/${id}`, {
    params: { revision },
  });
