import { requestClient } from '#/api/request';

export interface MenuInfo {
  menuId: string;
  menuName: string;
  parentName: string;
  parentId: number | string;
  orderNum: number;
  path: string;
  component: string;
  isFrame: string;
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
  return requestClient.get(`/system/menu/${menuId}`);
}

export function getMenuTree(params: any = {}) {
  return requestClient.get<MenuInfo[]>('/system/menu/tree', { params });
}
export function addMenu(data: any) {
  return requestClient.post('/system/menu/add', data);
}

export function updateMenu(data: any) {
  return requestClient.post('/system/menu/edit', data);
}

export function removeMenu(menuId: number | string) {
  return requestClient.post('/system/menu/remove', null, {
    params: { menuId },
  });
}
