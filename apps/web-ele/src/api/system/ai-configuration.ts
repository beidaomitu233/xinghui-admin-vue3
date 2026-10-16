import { requestClient } from '#/api/request';

export interface ConfigurationModel {
  jsonObject?: boolean;
  capabilityEvidence?: null | string;
  modelRef: string;
  modelCode: string;
}
export interface ConfigurationKey {
  keyRef: string;
  keyVersion: string;
  label: string;
  mode: 'DB' | 'ENV';
  envName: null | string;
}
export interface ConfigurationSnapshot {
  configVersion: string;
  providerCode: string;
  endpointUrl: string;
  protocol: string;
  timeoutSeconds: number;
  models: ConfigurationModel[];
  keys: ConfigurationKey[];
}
export interface ConfigurationPair {
  modelRef: string;
  keyRef: string;
  keyVersion: string;
}
export interface AiConfiguration {
  id: string;
  name: string;
  environment: string;
  providerCode: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'DISABLED' | 'DRAFT';
  revision: number;
  activeVersion: null | string;
  draft: ConfigurationSnapshot;
  activePairs: ConfigurationPair[];
  latestTestId: null | string;
  updatedAt: string;
  legacyModelId: null | string;
}
export interface ConfigurationRow {
  id: string;
  name: string;
  environment: string;
  providerCode: string;
  status: AiConfiguration['status'];
  revision: number;
  modelCount: number;
  usableKeyCount: number;
  latestTestTime: null | string;
}
export interface ConfigurationPage {
  jsonObjectModels?: string[];
  legacyModels: { id: string; modelCode: string; providerCode: string }[];
  records: ConfigurationRow[];
  total: number | string;
  pageNum: number;
  pageSize: number;
}
export interface DraftChange {
  revision: number;
  name: string;
  environment: string;
  providerCode: string;
  endpointUrl: string;
  protocol: string;
  timeoutSeconds: number;
  models: { jsonObject?: boolean; modelCode: string; modelRef?: string }[];
  keys: {
    apiKey: string;
    envName: null | string;
    keyRef?: string;
    label: string;
    mode: 'DB' | 'ENV';
  }[];
}
export interface ConfigurationTest {
  id: string;
  configId: string;
  configVersion: string;
  status: string;
  total: number;
  finished: number;
  pairs: {
    elapsedMs: null | number | string;
    errorCode: null | string;
    keyLabel: string;
    keyRef: string;
    keyVersion: string;
    modelCode: string;
    modelRef: string;
    status: 'FAILED' | 'PENDING' | 'RUNNING' | 'SUCCESS';
  }[];
}
export interface ConfigurationVersion {
  configVersion: string;
  snapshot: ConfigurationSnapshot;
  admittedPairs: ConfigurationPair[];
  createdAt: string;
  activated: boolean;
}
export interface ApplicationImpact {
  appId: string;
  appVersionId: string;
  name: string;
}
const base = '/system/ai/configurations';
export const listConfigurations = (params: {
  environment?: string;
  name?: string;
  pageNum: number;
  pageSize: number;
  providerCode?: string;
  status?: string;
}) => requestClient.get<ConfigurationPage>(base, { params });
export const getConfiguration = (id: string) =>
  requestClient.get<AiConfiguration>(`${base}/${id}`);
export const createConfiguration = (draft: DraftChange) =>
  requestClient.post<AiConfiguration>(base, { draft });
export const importLegacyConfiguration = (legacyModelId: string) =>
  requestClient.post<AiConfiguration>(base, { legacyModelId });
export const saveConfiguration = (id: string, draft: DraftChange) =>
  requestClient.put<AiConfiguration>(`${base}/${id}/draft`, draft);
export const configurationVersions = (id: string) =>
  requestClient.get<ConfigurationVersion[]>(`${base}/${id}/versions`);
export const configurationImpact = (id: string) =>
  requestClient.get<ApplicationImpact[]>(`${base}/${id}/impact`);
export const startConfigurationTest = (
  id: string,
  data: { configVersion: string; confirmedCosts: boolean; revision: number },
) => requestClient.post<ConfigurationTest>(`${base}/${id}/test-runs`, data);
export const getConfigurationTest = (id: string, testId: string) =>
  requestClient.get<ConfigurationTest>(`${base}/${id}/test-runs/${testId}`);
export const cancelConfigurationTest = (id: string, testId: string) =>
  requestClient.post<ConfigurationTest>(
    `${base}/${id}/test-runs/${testId}/cancel`,
  );
export const activateConfiguration = (
  id: string,
  data: { configVersion: string; onlyAvailable: boolean; revision: number },
) => requestClient.post<AiConfiguration>(`${base}/${id}/activate`, data);
export const disableConfiguration = (id: string, revision: number) =>
  requestClient.post<AiConfiguration>(`${base}/${id}/disable`, { revision });
export const archiveConfiguration = (id: string, revision: number) =>
  requestClient.post<AiConfiguration>(`${base}/${id}/archive`, { revision });
