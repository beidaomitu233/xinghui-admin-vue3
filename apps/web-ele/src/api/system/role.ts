import { requestClient } from '#/api/request';

export interface RoleInfo {
  roleId: string;
  roleName: string;
  roleKey: string;
  dataScope: string;
  status: number;
  createBy: string;
  createTime: string;
  updateBy: string;
  updateTime: string;
}

export async function getRoleList(
  params: Record<string, number | string | undefined>,
) {
  const result = await requestClient.get<{
    records: RoleInfo[];
    total: number | string;
  }>('/system/role/list', { params });
  const total = Number(result.total);
  if (!Number.isSafeInteger(total) || total < 0 || result.total === '')
    throw new Error('角色总数超出可显示范围');
  return { ...result, total };
}

export function getRole(roleId: string | undefined) {
  return requestClient.get<RoleInfo>(`/system/role/${roleId}`);
}

export interface RoleForm {
  roleId?: string;
  roleName: string;
  roleKey: string;
  status: number;
  dataScope?: string;
  menuIds: string[];
}

export function addRole(data: RoleForm) {
  return requestClient.post('/system/role/add', data);
}

export function updateRole(data: RoleForm) {
  return requestClient.post('/system/role/edit', data);
}

export function removeRole(roleId: string) {
  return requestClient.post('/system/role/remove', null, {
    params: { roleId },
  });
}

export function changeRoleStatus(roleId: string, status: number) {
  return requestClient.post('/system/role/changeStatus', null, {
    params: { roleId, status },
  });
}

// 获取角色的菜单ID列表
export function getMenuIdsByRoleId(roleId: string) {
  return requestClient.get<string[]>(`/system/role/menuIds/${roleId}`);
}

// 为角色分配菜单权限
export function assignMenusToRole(roleId: string, menuIds: string[]) {
  return requestClient.post('/system/role/assignMenus', menuIds, {
    params: { roleId },
  });
}
