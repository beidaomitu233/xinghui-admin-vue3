import type { DatabaseValue } from './ai-database';
import type { SceneSubmission } from './ai-scene';
import type { SceneDataPage } from './ai-scene-data';

import { requestClient } from '#/api/request';

export interface QueryContext {
  datasetKeys: string[];
  businessRef: SceneSubmission['businessRef'];
}
export interface QueryColumn {
  name: string;
  label: string;
  type: string;
  nullable: boolean;
}
export interface DatasetSchema {
  datasetKey: string;
  sqlName: string;
  label: string;
  description: string;
  scope: 'PERSONAL' | 'PLATFORM' | 'TENANT';
  scopeDescription: string;
  columns: QueryColumn[];
  schemaFingerprint: string;
}
export interface AuthorizedSchema {
  datasets: DatasetSchema[];
  supportedSyntax: string[];
  trustedParameters: string[];
  scopeDescription: string;
  fingerprint: string;
}
export type DatasetOption = Pick<
  DatasetSchema,
  'datasetKey' | 'label' | 'scope' | 'scopeDescription' | 'sqlName'
>;
export interface SqlQuery {
  sql: string;
  parameters: Record<string, DatabaseValue>;
  maxRows: number;
}
export interface QueryBinding {
  variable: string;
  label: string;
  description: string;
  datasetKeys: string[];
  query: SqlQuery;
}
export type QueryIssue =
  | 'CONTEXT_REQUIRED'
  | 'DATASET_FORBIDDEN'
  | 'FIELD_FORBIDDEN'
  | 'INVALID_SQL'
  | 'PARAMETER_INVALID'
  | 'QUERY_TIMEOUT'
  | 'READ_ONLY_UNAVAILABLE'
  | 'RESULT_LIMIT'
  | 'SCHEMA_CHANGED'
  | 'UNSUPPORTED_SYNTAX';
export interface QueryDiagnostic {
  path: string;
  code: QueryIssue;
}
export interface SqlValidation {
  usedDatasetKeys: string[];
  currentRecordDatasetKey: null | string;
  valid: boolean;
  normalizedSql: string;
  columns: QueryColumn[];
  diagnostics: QueryDiagnostic[];
  schemaFingerprint: string;
}
export interface QueryResult {
  columns: QueryColumn[];
  rows: Record<string, DatabaseValue>[];
  rowCount: number;
  truncated: boolean;
  notices: QueryDiagnostic[];
}
export interface QueryInput extends QueryContext {
  query: SqlQuery;
}
const base = '/system/ai/scene-data/sql';
export const getQueryCatalog = (params: {
  keyword?: string;
  pageNum: number;
  pageSize: number;
}) =>
  requestClient.get<SceneDataPage<DatasetOption>>(`${base}/catalog`, {
    params,
  });
export const getQuerySchema = (context: QueryContext) =>
  requestClient.post<AuthorizedSchema>(`${base}/schema`, context);
export const validateQuery = (input: QueryInput) =>
  requestClient.post<SqlValidation>(`${base}/validate`, input);
export const previewQuery = (input: QueryInput) =>
  requestClient.post<QueryResult>(`${base}/preview`, input);
const messages: Record<QueryIssue, string> = {
  INVALID_SQL: '查询语句未通过校验。',
  UNSUPPORTED_SYNTAX: '当前查询语法暂不支持。',
  DATASET_FORBIDDEN: '没有此数据来源的查询权限。',
  FIELD_FORBIDDEN: '查询包含不可读字段。',
  PARAMETER_INVALID: '请检查查询参数。',
  CONTEXT_REQUIRED: '请先选择本次业务记录。',
  SCHEMA_CHANGED: '数据定义已有变化，请重新读取范围。',
  READ_ONLY_UNAVAILABLE: '只读查询暂不可用。',
  QUERY_TIMEOUT: '查询已超时，请缩小范围。',
  RESULT_LIMIT: '查询结果已达到本次上限。',
};
export function queryIssueMessage(code: string) {
  return Object.hasOwn(messages, code)
    ? messages[code as QueryIssue]
    : '查询未完成，请检查当前范围。';
}
