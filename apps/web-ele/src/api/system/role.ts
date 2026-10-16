import { requestClient } from '#/api/request';

export interface RoleInfo {
  roleId: string;
  roleName: string;
  roleKey: string;
  roleSort: number;
  dataScope: string;
  menuCheckStrictly: boolean;
  deptCheckStrictly: boolean;
  status: number;
  delFlag: string;
  createBy: string;
  createTime: string;
  updateBy: string;
  updateTime: string;
  remark: string;
}

export function getRoleList(params: any) {
  return requestClient.get<{ records: RoleInfo[]; total: number }>(
    '/system/role/list',
    { params },
  );
}

export function getRole(roleId: string | undefined) {
  return requestClient.get<RoleInfo>(`/system/role/${roleId}`);
}

export function addRole(data: any) {
  return requestClient.post('/system/role/add', data);
}

export function updateRole(data: any) {
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
