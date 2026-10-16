import { requestClient } from '#/api/request';

export type Kind = 'data-resources' | 'templates';
export type JsonValue =
  | boolean
  | JsonValue[]
  | null
  | number
  | string
  | { [key: string]: JsonValue };
export interface Variable {
  name: string;
  type: 'ARRAY' | 'BOOLEAN' | 'NUMBER' | 'OBJECT' | 'STRING';
  required: boolean;
  hasDefault: boolean;
  defaultValue: JsonValue;
  maxChars: number;
  sensitive: boolean;
  truncate: boolean;
}
export interface Message {
  section: 'DATA' | 'INPUT' | 'INSTRUCTION';
  text: string;
}
export interface Parameter {
  source: 'ACTOR' | 'BUSINESS_REF' | 'INPUT';
  key: string;
}
export interface Binding {
  name: string;
  resourceId: string;
  resourceVersionId: string;
  required: boolean;
  omitOnMissing: boolean;
  parameters: Record<string, Parameter>;
  outputs: Record<string, string>;
}
export interface TemplateDefinition {
  name: string;
  purpose: string;
  owner: string;
  messages: Message[];
  variables: Variable[];
  resources: Binding[];
  maxChars: number;
}
export interface ResourceDefinition {
  name: string;
  domain: string;
  owner: string;
  source: 'lowcode.record';
  formId: string;
  fields: string[];
  subjects: string[];
  applications: string[];
  timeoutMillis: number;
}
export interface Version {
  id: string;
  version_no: number;
  config_hash: string;
  create_time: string;
  definition?: ResourceDefinition | TemplateDefinition;
}
export interface Summary {
  id: string;
  name: string;
  revision: number;
  enabled: boolean | number;
  state?: string;
  update_time: string;
}
export interface View extends Summary {
  definition: ResourceDefinition | TemplateDefinition;
  versions: Version[];
}
export interface Page {
  records: Summary[];
  total: string;
  pageNum: number;
  pageSize: number;
}
export interface TestRequest {
  revision: number;
  appId: string;
  businessRef: string;
  inputs: Record<string, JsonValue>;
}
export interface TestResult {
  outcome: string;
  fields: string[];
  schemaVersion: null | number;
  preview: null | {
    messages: Message[];
    notices: { kind: string; reference: string }[];
  };
  details: null | {
    inputs: Record<string, string>;
    original: Message[];
    resources: Record<string, string>;
  };
}
const root = (kind: Kind) => `/system/ai/${kind}`;
export const listDefinitions = (kind: Kind, pageNum = 1, pageSize = 20) =>
  requestClient.get<Page>(root(kind), { params: { pageNum, pageSize } });
export const getDefinition = (kind: Kind, id: string) =>
  requestClient.get<View>(`${root(kind)}/${id}`);
export const createDefinition = (
  kind: Kind,
  definition: ResourceDefinition | TemplateDefinition,
) => requestClient.post<string>(root(kind), definition);
export const saveDefinition = (
  kind: Kind,
  id: string,
  revision: number,
  definition: ResourceDefinition | TemplateDefinition,
) =>
  requestClient.put<View>(`${root(kind)}/${id}/draft`, {
    revision,
    definition,
  });
export const testDefinition = (
  kind: Kind,
  id: string,
  data: TestRequest,
  preview = false,
) =>
  requestClient.post<TestResult>(
    `${root(kind)}/${id}/${preview ? 'preview' : 'test'}`,
    data,
  );
export const changeDefinition = (
  kind: Kind,
  id: string,
  action: 'approval' | 'publish' | 'submit',
  revision: number,
  approved?: boolean,
) =>
  requestClient.post<View>(`${root(kind)}/${id}/${action}`, {
    revision,
    ...(approved === undefined ? {} : { approved }),
  });
export const setDefinitionEnabled = (
  kind: Kind,
  id: string,
  revision: number,
  enabled: boolean,
) =>
  requestClient.request<View>(`${root(kind)}/${id}/enabled`, {
    data: { revision, enabled },
    method: 'PATCH',
  });
export const getVersion = (kind: Kind, id: string, version: string) =>
  requestClient.get<Version>(`${root(kind)}/${id}/versions/${version}`);
export const getReferences = (kind: Kind, id: string, version: string) =>
  requestClient.get<{ appId: string; appVersionId: string; name: string }[]>(
    `${root(kind)}/${id}/versions/${version}/references`,
  );
export const getChecks = (id: string) =>
  requestClient.get<Record<string, string>[]>(
    `${root('data-resources')}/${id}/checks`,
  );
export interface LegacyScene {
  scene_id: string;
  app_key: string;
  scene_key: string;
  published_model_id: null | string;
  published_revision: null | number;
}
export const listLegacyScenes = (pageNum = 1) =>
  requestClient.get<{ records: LegacyScene[]; total: string }>(
    '/system/ai/templates/legacy-scenes',
    { params: { pageNum, pageSize: 20 } },
  );
