import { requestClient } from '#/api/request';

export interface UserInfo {
  userId: string;
  username: string;
  nickname: string;
  email: string;
  mobile: string;
  avatar: string;
  status: number;
  createTime: string;
}

export interface UserForm extends Omit<UserInfo, 'createTime' | 'userId'> {
  userId?: string;
  password?: string;
  roleIds: string[];
}

export interface PageResult<T> {
  records: T[];
  total: number;
}

export interface UserImportRowResult {
  rowNumber: number;
  status: 'failed' | 'skipped' | 'success';
  field: string;
  reason: string;
}

export interface UserImportSummary {
  totalRows: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  rows: UserImportRowResult[];
}

export async function getUserList(params: Record<string, number | string>) {
  const data = await requestClient.get<
    Omit<PageResult<UserInfo>, 'total'> & { total: number | string }
  >('/system/user/list', {
    params,
  });
  const total = Number(data.total);
  if (!Number.isSafeInteger(total) || total < 0 || data.total === '') {
    throw new Error('用户总数超出可显示范围');
  }
  return { ...data, total };
}

export function getUser(userId: string) {
  return requestClient.get<{ roleIds: string[]; user: UserInfo }>(
    `/system/user/${userId}`,
  );
}

export function addUser(data: UserForm) {
  return requestClient.post<string>('/system/user/add', data);
}

export function updateUser(data: UserForm) {
  return requestClient.post('/system/user/edit', data);
}

export function removeUser(userId: string) {
  return requestClient.post(`/system/user/remove`, null, {
    params: { userId },
  });
}

export function resetUserPwd(userId: string) {
  return requestClient.post<string>('/system/user/resetPwd', null, {
    params: { userId },
  });
}

export function downloadUserImportTemplate() {
  return requestClient.get<Blob>('/system/user/importTemplate', {
    responseType: 'blob',
    responseReturn: 'body',
  });
}

export function importUsers(file: File) {
  return requestClient.upload<UserImportSummary>(
    '/system/user/import',
    { file },
    { timeout: 120_000 },
  );
}

export function exportUsers(params: Record<string, number | string>) {
  return requestClient.get<Blob>('/system/user/export', {
    params,
    responseType: 'blob',
    responseReturn: 'body',
  });
}
