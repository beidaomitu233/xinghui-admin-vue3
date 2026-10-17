import { requestClient } from '#/api/request';

export interface SceneDataPage<T> {
  pageNum: number;
  pageSize: number;
  records: T[];
  total: string;
}
export interface SceneDataForm {
  formId: string;
  name: string;
  schemaVersion: number;
}
export interface SceneDataField {
  fieldKey: string;
  label: string;
  nullable: boolean;
  type: string;
  variableName: string;
}
export interface SceneDataSample {
  label: string;
  recordId: string;
  revision: number;
  schemaVersion: number;
}
export interface SceneDataCatalog {
  inputVariables: {
    label: string;
    maxChars: number;
    name: string;
    required: boolean;
    type: string;
  }[];
  objects: { description: string; name: string; objectKey: string }[];
}
const base = '/system/ai/scene-data';
export const sceneDataCatalog = () =>
  requestClient.get<SceneDataCatalog>(`${base}/catalog`);
export const sceneDataForms = (params: {
  keyword?: string;
  pageNum: number;
  pageSize: number;
}) =>
  requestClient.get<SceneDataPage<SceneDataForm>>(`${base}/forms`, { params });
export const sceneDataFields = (params: {
  formId: string;
  objectKey: string;
}) =>
  requestClient.get<{
    fields: SceneDataField[];
    formId: string;
    objectKey: string;
    schemaVersion: number;
  }>(`${base}/fields`, { params });
export const sceneDataSamples = (params: {
  formId: string;
  keyword?: string;
  objectKey: string;
  pageNum: number;
  pageSize: number;
}) =>
  requestClient.get<SceneDataPage<SceneDataSample>>(`${base}/samples`, {
    params,
  });
