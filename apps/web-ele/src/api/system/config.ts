import { requestClient } from '#/api/request';

export interface ConfigView {
  configId: number;
  configKey: string;
  configName: string;
  configValue: string;
  runtimeActive: boolean;
  deletable: boolean;
}

export interface ConfigChange {
  configKey: string;
  configValue: string;
}

export const listConfigs = () =>
  requestClient.get<ConfigView[]>('/sysConfig/list');
export const getConfig = (id: number) =>
  requestClient.get<ConfigView>(`/sysConfig/${id}`);
export const addConfig = (data: ConfigChange) =>
  requestClient.post<number>('/sysConfig', data);
export const editConfig = (id: number, data: ConfigChange) =>
  requestClient.put<undefined>(`/sysConfig/${id}`, data);
export const removeConfig = (id: number) =>
  requestClient.delete<undefined>(`/sysConfig/${id}`);
