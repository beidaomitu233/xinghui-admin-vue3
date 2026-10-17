import type { AiRestLong } from './ai-application';

import { requestClient } from '#/api/request';

export interface CatalogModel {
  code: string;
  contextLength: AiRestLong | null;
  inputModalities: string[];
  maxCompletionTokens: AiRestLong | null;
  name: string;
  outputModalities: string[];
  supportedParameters: string[];
}
export interface ModelCatalogPage {
  scannedCount?: number;
  filteredCount?: number;
  filterReasons?: Record<string, number>;
  configId: null | string;
  generationVerified: false;
  keyId: null | string;
  pageNum: number;
  pageSize: number;
  provider: string;
  records: CatalogModel[];
  refreshedAt: string;
  revision: null | number;
  source: 'PROVIDER_KEY' | 'PUBLIC' | 'USER_FILTERED';
  total: number;
}
export interface CatalogQuery {
  pageNum: number;
  pageSize: number;
  search?: string;
}
export interface SavedCatalogScan extends CatalogQuery {
  configId: string;
  expectedRevision: number;
  keyId: string;
}
export interface DraftCatalogScan extends CatalogQuery {
  apiKey: string;
  provider: string;
}
const base = '/system/ai/model-catalog';
export const publicModelCatalog = (params: CatalogQuery) =>
  requestClient.get<ModelCatalogPage>(base, { params });
export const scanSavedModels = (
  input: SavedCatalogScan,
  signal?: AbortSignal,
) => requestClient.post<ModelCatalogPage>(`${base}/scan`, input, { signal });
export const scanDraftModels = (
  input: DraftCatalogScan,
  signal?: AbortSignal,
) =>
  requestClient.post<ModelCatalogPage>(`${base}/draft-scan`, input, { signal });

const errors: Record<string, string> = {
  CONFIG_CHANGED: '渠道已更新，请刷新后重新获取目录。',
  CONFIG_UNAVAILABLE: '此渠道暂不可用。',
  CREDENTIAL_UNAVAILABLE: '该 Key 暂不可用，请检查后重试。',
  KEY_NOT_FOUND: '此 Key 已变化，请刷新渠道。',
  KEY_REQUIRED: '请先填写 API Key。',
  NETWORK_UNAVAILABLE: '目录服务暂时无法连接。',
  PROVIDER_UNSUPPORTED: '此服务商暂不支持目录扫描。',
  RATE_LIMITED: '目录请求过于频繁，请稍后重试。',
  TIMEOUT: '目录读取超时，请重试。',
  UPSTREAM_FORBIDDEN: '此 Key 无权读取模型目录。',
  UPSTREAM_UNAUTHORIZED: '模型目录认证失败，请检查 Key。',
};
export function catalogError(error: unknown) {
  const data = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data;
  const code =
    typeof data?.message === 'string' &&
    data.message.startsWith('AI_MODEL_CATALOG:')
      ? data.message.slice('AI_MODEL_CATALOG:'.length)
      : '';
  return (
    (Object.hasOwn(errors, code) && errors[code]) ||
    '模型目录暂不可用，请稍后重试。'
  );
}
