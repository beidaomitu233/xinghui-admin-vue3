import { requestClient } from '#/api/request';

export interface MenuInfo {
  menuId: string;
  menuName: string;
  parentName: string;
  parentId: number | string;
  orderNum: number;
  path: string;
  component: string;
  isFrame: number | string;
  isCache: string;
  menuType: string;
  visible: string;
  status: string;
  perms: string;
  icon: string;
  createBy: string;
  createTime: string;
  updateBy: string;
  updateTime: string;
  remark: string;
  children: MenuInfo[];
}

export function getMenuList(params: any) {
  return requestClient.get('/system/menu/list', { params });
}

export function getMenu(menuId: number | string) {
  return requestClient.get<MenuInfo>(`/system/menu/${menuId}`);
}

export function getMenuTree(params: any = {}) {
  return requestClient.get<MenuInfo[]>('/system/menu/tree', { params });
}
export interface MenuForm {
  menuId?: string;
  parentId: number | string;
  menuName: string;
  menuType: string;
  orderNum: number;
  icon: string;
  path: string;
  component: string;
  perms: string;
  visible: string;
  status: string;
  isFrame: number;
}

export function addMenu(data: MenuForm) {
  return requestClient.post('/system/menu/add', data);
}

export function updateMenu(data: MenuForm) {
  return requestClient.post('/system/menu/edit', data);
}

export function removeMenu(menuId: number | string) {
  return requestClient.post('/system/menu/remove', null, {
    params: { menuId },
  });
}
