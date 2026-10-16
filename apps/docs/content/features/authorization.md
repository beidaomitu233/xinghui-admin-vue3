# 角色与授权

入口为 **系统管理 → 角色管理**。角色把用户与菜单、动作权限关联起来；当前界面不是一个新增部门、岗位或任意数据范围表达式的平台。

## 身份与前置

操作需要对应 `system:role:*` 权限。开启租户时，角色和用户分配必须处于当前服务端允许的范围。平台专属功能还要满足平台身份检查；给普通租户角色勾选平台动作不能绕过这个检查。

## 分配流程

1. 查询角色，新增时设置角色名称、标识、排序、状态及备注。角色 ID 为字符串。
2. 点击该角色“编辑”，在弹窗“菜单权限”树调整授权；页面读取菜单树和该角色已拥有的 `menuIds`，当前没有独立的“分配权限”按钮。
3. 区分目录、页面和按钮：目录用于组织，页面允许访问，按钮对应新增/编辑等精确动作。仅选择目录不等于拥有页面能力。
4. 确认菜单选中状态后保存授权；在用户管理中把角色分配给目标用户。
5. 使用该用户重新登录检查菜单和按钮，再验证服务端拒绝未授权动作。权限变化不能只凭旧页面上的按钮判断。

## 请求契约

`GET /system/role/menuIds/{roleId}` 返回字符串 ID 数组；`POST /system/role/assignMenus` 的 body 是该数组，`roleId` 是查询参数。不要把数组改成 `{ menuIds: [...] }` 后直接调用原接口。

```ts
import { assignMenusToRole } from '#/api/system/role';

// ID 取自当前详情/授权树，示例中不硬编码角色或超级管理员 ID。
async function saveGrantedMenus(roleId: string, menuIds: string[]) {
  await assignMenusToRole(roleId, menuIds);
}
```

## 正常结果与恢复

保存后重新读取菜单 ID，选中状态应一致。启停角色使用独立状态动作；停用角色后检查相关用户的会话与下一次授权读取，不要假设浏览器旧缓存已经清空。菜单树读取失败时停止保存，避免用空树覆盖授权；角色或菜单不存在时先刷新。平台资源仍不可见时检查平台身份，而不是重复授予同一动作。

## 源码依据

- `apps/web-ele/src/views/system/role/index.vue`、`apps/web-ele/src/api/system/role.ts`（`getMenuIdsByRoleId`、`assignMenusToRole`）。
- 后端：`system-admin/src/main/java/com/xinghuiTec/controller/SysRoleController.java`。
- 平台响应过滤：`system-admin/src/main/java/com/xinghuiTec/security/PlatformVisibilityService.java`。
- 阅读[路由和权限](/development/routes-permissions)，不要将前端隐藏当作后端授权。
