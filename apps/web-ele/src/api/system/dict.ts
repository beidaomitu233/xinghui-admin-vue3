import { requestClient } from '#/api/request';

export interface DictType {
  id: number;
  code: string;
  name: string;
  enabled: boolean;
  remark?: string;
  revision: number;
}

export interface DictItem {
  id: number;
  typeId: number;
  value: string;
  label: string;
  sortOrder: number;
  enabled: boolean;
  remark?: string;
}

export interface DictOption {
  value: string;
  label: string;
  sortOrder: number;
}

export interface DictLabel {
  value: string;
  label: string;
  known: boolean;
  enabled: boolean;
}

export const listDictTypes = () =>
  requestClient.get<DictType[]>('/system/dict/types');
export const listDictItems = (typeId: number) =>
  requestClient.get<DictItem[]>(`/system/dict/types/${typeId}/items`);
export const createDictType = (data: Omit<DictType, 'id' | 'revision'>) =>
  requestClient.post<number>('/system/dict/types', data);
export const updateDictType = (
  id: number,
  data: Pick<DictType, 'enabled' | 'name' | 'remark'>,
) => requestClient.put(`/system/dict/types/${id}`, data);
export const createDictItem = (
  typeId: number,
  data: Omit<DictItem, 'id' | 'typeId'>,
) => requestClient.post<number>(`/system/dict/types/${typeId}/items`, data);
export const updateDictItem = (
  id: number,
  data: Pick<DictItem, 'enabled' | 'label' | 'remark' | 'sortOrder'>,
) => requestClient.put(`/system/dict/items/${id}`, data);

// Business reads deliberately do not expose the configuration list.
export const getDictOptions = (code: string) =>
  requestClient.get<DictOption[]>(`/dict/${encodeURIComponent(code)}/options`);
export const getDictLabel = (code: string, value: string) =>
  requestClient.get<DictLabel>(
    `/dict/${encodeURIComponent(code)}/labels/${encodeURIComponent(value)}`,
  );
