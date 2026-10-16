# 账号与个人信息

账号页用于管理后台用户；个人信息页用于当前登录者查看和修改自己的资料。入口分别为 **系统管理 → 用户管理**、头像菜单中的个人信息（`/profile`）。本版本没有部门或岗位管理流程。

## 身份与前置

用户列表需要 `system:user:list`；详情、新增、编辑、删除分别检查 `system:user:query/add/edit/remove`。重置密码使用编辑权限。角色选择来自当前身份允许分配的角色；开启租户后，不能凭页面传入的用户 ID 越过服务端租户范围。拥有登录身份不代表拥有用户管理权限。

## 操作步骤

1. 用账号、手机或状态筛选列表，点击查询；切换条件后从第一页读取。
2. 点击新增，填写账号、昵称、联系方式、密码及角色；角色 ID 保持字符串，不手工转成数字。
3. 编辑时先读取详情中的 `user` 和 `roleIds`，确认选中的角色再保存。只读详情不提供保存动作。
4. 删除或重置密码先阅读确认框。重置返回的临时密码只用于交接，不写入日志或文档，随后让用户修改。
5. 重新打开详情或刷新列表，确认保存结果；批量表格操作见[用户导入导出](/features/bulk)。

## 字段与接口

| 字段 | 前端契约 | 使用方式 |
| --- | --- | --- |
| `userId` | string | 服务端分配；编辑/删除保持原值 |
| `username` / `nickname` | string | 账号与显示名称分别填写 |
| `mobile` / `email` | string | 使用自己的合法联系方式，不复制种子信息 |
| `status` | number | 按页面启停选项提交 |
| `roleIds` | string[] | 仅选当前允许分配的角色 |
| `password` | optional string | 新建时填写；不要用空字符串模拟密码重置 |

列表为 `GET /system/user/list`，新建/编辑为 `POST /system/user/add`、`POST /system/user/edit`；详情为 `GET /system/user/{userId}`。删除和重置是携带 `userId` 查询参数的 POST，请调用现有 API 函数。

## 正常结果与恢复

保存成功后应能读回用户及角色；删除成功后列表不再出现该记录。没有动作权限时按钮隐藏或不可用，直接请求仍被拒绝。列表失败时重试；保存失败时保留表单并检查字段提示，不要连续点击生成重复用户。账号/联系方式重复、角色越权等问题应修改数据后再提交；会话失效需要重新登录。

## 源码依据

- 前端：`apps/web-ele/src/views/system/user/index.vue`、`apps/web-ele/src/api/system/user.ts`（`UserForm`、`getUser`）。
- 后端：`system-admin/src/main/java/com/xinghuiTec/controller/SysUserController.java`（`getUser`、`addUser`、`resetPassword`）。
- 本人页面：`apps/web-ele/src/views/_core/profile/personal-profile.vue`；权限与租户规则见[身份边界](/development/tenant-platform)。
