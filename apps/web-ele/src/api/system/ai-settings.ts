import { requestClient } from '#/api/request';

export interface SettingsModel {
  code: string;
  name: string;
}
export interface SettingsProvider {
  code: string;
  defaultEndpoint: string;
  name: string;
  suggestedModels: SettingsModel[];
}
export type ConnectionStatus =
  | 'CANCELLED'
  | 'FAILED'
  | 'INTERRUPTED'
  | 'NOT_TESTED'
  | 'PARTIAL'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED';
export interface SettingsConnection {
  active: boolean;
  checkedAt: null | string;
  message: string;
  status: ConnectionStatus;
  testId: null | string;
}
export interface AiSettingsView {
  keys: SettingsKeyView[];
  pendingChanges?: boolean;
  active: boolean;
  configId: string;
  connection: null | SettingsConnection;
  endpointUrl: string;
  keyConfigured: boolean;
  maskedKey: string;
  models: SettingsModel[];
  name: string;
  provider: string;
  revision: number;
}
export interface AiSettingsChange {
  clientMutationId?: string;
  apiKey?: null | string;
  keys?: SettingsKeyChange[];
  endpointUrl: string;
  expectedRevision: null | number;
  modelCodes?: string[];
  name: string;
  provider: string;
}
export interface AiSettingsPage {
  pageNum: number;
  pageSize: number;
  records: AiSettingsView[];
  total: string;
}
export interface SettingsTestRun {
  keys: SettingsKeyResult[];
  active: boolean;
  configId: string;
  message: string;
  models: { code: string; message: string; status: ConnectionStatus }[];
  status: ConnectionStatus;
  testId: string;
}
export interface SettingsKeyChange {
  apiKey?: null | string;
  keyId?: string;
  modelCodes?: string[];
  name: string;
}
export interface SettingsModelResult {
  code: string;
  message: string;
  status: ConnectionStatus;
}
export interface SettingsKeyResult {
  keyId: string;
  message: string;
  models: SettingsModelResult[];
  name: string;
  status: ConnectionStatus;
}
export interface SettingsKeyView extends SettingsKeyResult {
  keyConfigured: boolean;
  maskedKey: string;
  modelCodes: string[];
}
export const OPENROUTER_SUGGESTED_MODELS: SettingsModel[] = [
  { code: 'poolside/laguna-s-2.1:free', name: 'Poolside Laguna S 2.1' },
  {
    code: 'nvidia/nemotron-3.5-lightning:free',
    name: 'NVIDIA Nemotron 3.5 Lightning',
  },
];
const base = '/system/ai/settings';
export const settingsProviders = () =>
  requestClient.get<SettingsProvider[]>(`${base}/providers`);
export const listAiSettings = (params: {
  order?: 'asc' | 'desc';
  orderBy?: string;
  pageNum: number;
  pageSize: number;
  search?: string;
}) => requestClient.get<AiSettingsPage>(base, { params });
export const getAiSettings = (configId: string) =>
  requestClient.get<AiSettingsView>(`${base}/${encodeURIComponent(configId)}`);
export const createAiSettings = (input: AiSettingsChange) =>
  requestClient.post<AiSettingsView>(base, input);
export const updateAiSettings = (configId: string, input: AiSettingsChange) =>
  requestClient.put<AiSettingsView>(
    `${base}/${encodeURIComponent(configId)}`,
    input,
  );
export const testAiSettings = (
  configId: string,
  input: { activateOnSuccess: boolean; confirmedCosts: boolean },
) =>
  requestClient.post<SettingsTestRun>(
    `${base}/${encodeURIComponent(configId)}/connection-tests`,
    input,
  );
export const getAiSettingsTest = (configId: string, testId: string) =>
  requestClient.get<SettingsTestRun>(
    `${base}/${encodeURIComponent(configId)}/connection-tests/${encodeURIComponent(testId)}`,
  );
