import { requestClient } from '#/api/request';

export type FieldType =
  | 'checkbox'
  | 'color'
  | 'date'
  | 'daterange'
  | 'multiselect'
  | 'number'
  | 'radio'
  | 'rate'
  | 'select'
  | 'slider'
  | 'switch'
  | 'text'
  | 'textarea'
  | 'time'
  | 'timerange';
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
  ui?: null | {
    clearable?: boolean;
    disabled?: boolean;
    placeholder?: string;
    readOnly?: boolean;
    showWordLimit?: boolean;
    span?: 6 | 8 | 12 | 24;
  };
}
export interface FormSchema {
  fields: FormField[];
  layout?: null | {
    labelPosition: 'left' | 'right' | 'top';
    labelWidth: number;
  };
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
  order?: 'asc' | 'desc';
  orderBy?: string;
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
    order?: 'asc' | 'desc';
    orderBy?: string;
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
export interface SharingSettings {
  enabled: boolean;
  accessMode: 'login' | 'public';
  revision: number;
  token: null | string;
}
export const readSharing = (id: string) =>
  requestClient.get<SharingSettings>(`${base}/${id}/sharing`);
export const saveSharing = (
  id: string,
  data: Pick<SharingSettings, 'accessMode' | 'enabled' | 'revision'> & {
    rotate?: boolean;
  },
) => requestClient.put<SharingSettings>(`${base}/${id}/sharing`, data);
