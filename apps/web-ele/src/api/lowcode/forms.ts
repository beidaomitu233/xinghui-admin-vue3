import { requestClient } from '#/api/request';

export type FieldType =
  | 'date'
  | 'multiselect'
  | 'number'
  | 'select'
  | 'switch'
  | 'text'
  | 'textarea';
export type FieldValue = boolean | null | number | string | string[];
export interface FormField {
  fieldKey: string;
  label: string;
  type: FieldType;
  required: boolean;
  defaultValue: FieldValue;
  options: { label: string; value: string }[];
  help: string;
  maxLength: number;
  min: null | number;
  max: null | number;
  listVisible: boolean;
  searchable: boolean;
}
export interface FormSchema {
  fields: FormField[];
}
export interface FormDraft {
  name: string;
  formKey: string;
  status: 'disabled' | 'draft' | 'enabled';
  revision: number;
  schema: FormSchema;
}
export interface FormDefinition extends FormDraft {
  id: string;
  publishedVersion: number;
  createTime: string;
  updateTime: string;
}
export interface RuntimeDefinition {
  id: string;
  name: string;
  status: FormDraft['status'];
  schemaVersion: number;
  schema: FormSchema;
}
export interface FormRecordRow {
  id: string;
  formId: string;
  schemaVersion: number;
  revision: number;
  tenantId: string;
  creator: string;
  createTime: string;
  updateTime: string;
  data: Record<string, FieldValue>;
}
export interface FormRecord extends FormRecordRow {
  schema: FormSchema;
}
export interface Page<T> {
  records: T[];
  total: string;
  pageNum: number;
  pageSize: number;
}
export interface Submission {
  schemaVersion: number;
  revision?: number;
  data: Record<string, FieldValue>;
}
const base = '/lowcode/forms';
export const listForms = (params: {
  name?: string;
  pageNum: number;
  pageSize: number;
}) => requestClient.get<Page<FormDefinition>>(base, { params });
export const getForm = (id: string) =>
  requestClient.get<FormDefinition>(`${base}/${id}`);
export const createForm = (data: FormDraft) =>
  requestClient.post<string>(base, data);
export const updateForm = (id: string, data: FormDraft) =>
  requestClient.put<FormDefinition>(`${base}/${id}`, data);
export const publishForm = (id: string, revision: number) =>
  requestClient.post<FormDefinition>(`${base}/${id}/publish`, { revision });
export const removeForm = (id: string, revision: number) =>
  requestClient.delete<null>(`${base}/${id}`, { params: { revision } });
export const getRuntime = (id: string) =>
  requestClient.get<RuntimeDefinition>(`${base}/${id}/runtime`);
export const listRecords = (
  id: string,
  params: {
    filterField?: string;
    filterValue?: string;
    pageNum: number;
    pageSize: number;
  },
) =>
  requestClient.get<Page<FormRecordRow>>(`${base}/${id}/records`, { params });
export const getRecord = (id: string, recordId: string) =>
  requestClient.get<FormRecord>(`${base}/${id}/records/${recordId}`);
export const addRecord = (id: string, data: Submission) =>
  requestClient.post<FormRecord>(`${base}/${id}/records`, data);
export const updateRecord = (id: string, recordId: string, data: Submission) =>
  requestClient.put<FormRecord>(`${base}/${id}/records/${recordId}`, data);
export const removeRecord = (id: string, recordId: string, revision: number) =>
  requestClient.delete<null>(`${base}/${id}/records/${recordId}`, {
    params: { revision },
  });
