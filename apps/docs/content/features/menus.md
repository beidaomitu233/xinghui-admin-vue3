# 菜单与页面入口

菜单管理位于 **系统管理 → 菜单管理**。当前源码默认导航按 **系统管理、通用能力、运行维护、AI管理** 四个一级目录组织。页面的可见集合来自用户实际授权，不保证每个身份都能看到四组中的全部子项。v1.2.0静态旧快照沿用原三组布局，不能据此推断当前源码的菜单结构。

## 菜单字段

| 字段 | 含义与填写要求 |
| --- | --- |
| `menuType` | `M` 目录、`C` 页面、`F` 动作；按页面选项填写 |
| `parentId` / `orderNum` | 父级与同级排序；父级 ID 保持字符串精度 |
| `path` | 路由路径；已有页面迁移后保留绝对深链 |
| `component` | 如 `system/news/index`，对应 views 下文件，不带 `.vue` |
| `perms` | 服务端检查的精确权限串，如 `system:news:list` |
| `visible` / `status` | 控制显示和启停；不替代服务端权限检查 |
| `isFrame` / `isCache` | 按当前管理页面枚举提交，不自行解释为布尔字段 |

## 操作步骤

具有相应 `system:menu:*` 权限的用户先读取菜单树，选择父级，填写路由、组件与权限串后保存。随后在角色管理分配页面和按钮权限，用目标身份重新登录，检查菜单、深链刷新及直接 API 请求。

创建一个新的业务页面应放入现有合适目录。不要为文档、个人通知或已删除示例业务再建立第四个一级菜单。当前个人通知由受保护的核心路由与菜单组合逻辑提供；运行表单和记录页是隐藏路由，不能当作普通公开菜单发放。

## 正常结果与恢复

正确组件路径能够加载真实页面；未授权页面被拒绝或不出现在菜单中。组件未找到会进入路由错误恢复界面，应检查路径与文件大小写，不能用空白页掩盖。更改父级后旧链接应继续按绝对 path 工作；树出现重复入口时先核对现有菜单和核心路由，避免重复插入。

最新菜单迁移保留现存页面/按钮授权；旧资料、网站、下载与页面业务模块已移除。微信旧配置深链转向业务配置的微信分区，具体行为见[业务配置](/features/business-config)。

## 源码依据

- 前端：`apps/web-ele/src/api/system/menu.ts`、`apps/web-ele/src/views/system/menu/index.vue`。
- 路由加载：`apps/web-ele/src/router/routes-helper.ts`；核心入口：`apps/web-ele/src/router/routes/core.ts`。
- 后端：`system-admin/src/main/java/com/xinghuiTec/controller/SysMenuController.java`。
- 旧三组层级：`system-admin/src/main/resources/db/migration/V20261013_170__menu_consolidation.sql`；当前独立AI组与动作：`V20261016_180__ai_config_v04.sql`、`V20261016_210__ai_access_actions.sql`（同目录）。
