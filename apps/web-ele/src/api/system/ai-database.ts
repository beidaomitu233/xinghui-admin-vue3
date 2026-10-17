import type { SceneSubmission } from './ai-scene';
import type { SceneDataPage } from './ai-scene-data';

import { requestClient } from '#/api/request';

export type DatabaseValue =
  | boolean
  | DatabaseValue[]
  | null
  | number
  | string
  | { [key: string]: DatabaseValue };
export type BindingMode = 'CHILDREN' | 'FIELD' | 'ROW' | 'TABLE';
export type FilterOperator =
  | 'CONTAINS'
  | 'EQ'
  | 'GE'
  | 'GT'
  | 'IS_NULL'
  | 'LE'
  | 'LT'
  | 'NE'
  | 'NOT_NULL';
export interface DataFilter {
  field: string;
  operator: FilterOperator;
  value: DatabaseValue;
}
export interface DataBinding {
  fields: string[];
  filters: DataFilter[];
  label: string;
  limit: number;
  mode: BindingMode;
  relation: null | {
    childField: string;
    parentField: string;
    parentVariable: string;
  };
  row: null | { currentRecord: boolean; key: Record<string, DatabaseValue> };
  sourceKey: string;
  variable: string;
}
export interface DatabaseTable {
  comment: string;
  label: string;
  primaryKey: string[];
  sourceKey: string;
  tableName: string;
}
export interface DatabaseField {
  comment: string;
  field: string;
  label: string;
  nullable: boolean;
  primaryKey: boolean;
  type: string;
}
export interface DatabaseFields {
  fields: DatabaseField[];
  primaryKey: string[];
  sourceKey: string;
}
export interface DatabaseRelation {
  childField: string;
  childSourceKey: string;
  foreignKey: boolean;
  name: string;
  parentField: string;
  parentSourceKey: string;
}
export interface DatabaseRecord {
  businessRef: NonNullable<SceneSubmission['businessRef']>;
  key: Record<string, DatabaseValue>;
  label: string;
  values: Record<string, DatabaseValue>;
}
export interface DatabaseRecords {
  records: DatabaseRecord[];
  truncated: boolean;
}
export interface BindingPreview {
  notices: { code: string; reference: string }[];
  reads: {
    rowCount: number;
    sourceKey: string;
    truncated: boolean;
    variable: string;
  }[];
  values: Record<string, DatabaseValue>;
}
const base = '/system/ai/scene-data';
export const databaseTables = (params: {
  keyword?: string;
  pageNum: number;
  pageSize: number;
}) =>
  requestClient.get<SceneDataPage<DatabaseTable>>(`${base}/database/tables`, {
    params,
  });
export const databaseFields = (sourceKey: string) =>
  requestClient.get<DatabaseFields>(`${base}/database/fields`, {
    params: { sourceKey },
  });
export const databaseRelations = (sourceKey: string) =>
  requestClient.get<DatabaseRelation[]>(`${base}/database/relations`, {
    params: { sourceKey },
  });
export const databaseRecords = (input: {
  filters: DataFilter[];
  limit: number;
  sourceKey: string;
}) => requestClient.post<DatabaseRecords>(`${base}/database/records`, input);
export const previewBindings = (input: {
  bindings: DataBinding[];
  businessRef: SceneSubmission['businessRef'];
}) => requestClient.post<BindingPreview>(`${base}/bindings/preview`, input);
