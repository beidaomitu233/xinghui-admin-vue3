# 菜单与页面入口

菜单管理位于 **系统管理 → 菜单管理**。当前源码将 **工作台、看板** 作为独立一级入口排在前两位，其后为 **系统管理、通用能力、运行维护、AI管理**。页面的可见集合来自用户实际授权：没有工作台或看板权限的账号不会因排序调整获得这些页面。v1.2.0静态旧快照沿用原三组布局，不能据此推断当前源码的菜单结构。

左侧目录独立展开，打开另一个目录不会收起已打开的目录。刷新和侧栏折叠再展开会恢复当前账号的展开状态；更换账号后仅恢复该账号有权看到的目录。升级会定向调整旧手风琴偏好，不要求清理缓存，主题、侧栏宽度等其他设置保留。默认头像、Logo与常用图标随应用提供本地资源。

AI管理的日常入口为独立AI配置（`/ai/configurations`）、提示词配置（`/ai/templates`）和调用监控（`/ai/requests`）。AI配置管理渠道、命名Key、模型扫描与连接测试；提示词页编辑场景和数据引用；调用监控查看完整对话及续聊。本轮配置、数据预览、引用保存和对话阅读已原生验证，真实供应商限制见[版本组合](../releases/versions.md)。入口可见不授予配置读写、场景编辑、业务调用、记录读取或日志审计权限，各动作独立检查。

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

创建一个新的业务页面应放入现有合适目录，不为文档、个人通知或已删除示例业务额外增加一级菜单。当前个人通知由受保护的核心路由与菜单组合逻辑提供；运行表单和记录页是隐藏路由，不能当作普通公开菜单发放。

## 正常结果与恢复

正确组件路径能够加载真实页面；未授权页面被拒绝或不出现在菜单中。组件未找到会进入路由错误恢复界面，应检查路径与文件大小写，不能用空白页掩盖。更改父级后旧链接应继续按绝对 path 工作；树出现重复入口时先核对现有菜单和核心路由，避免重复插入。

最新菜单迁移保留现存页面/按钮授权；旧资料、网站、下载与页面业务模块已移除。微信旧配置深链转向业务配置的微信分区，具体行为见[业务配置](/features/business-config)。

## 源码依据

- 前端：`apps/web-ele/src/api/system/menu.ts`、`apps/web-ele/src/views/system/menu/index.vue`。
- 路由加载：`apps/web-ele/src/router/routes-helper.ts`；核心入口：`apps/web-ele/src/router/routes/core.ts`。
- 后端：`system-admin/src/main/java/com/xinghuiTec/controller/SysMenuController.java`。
- 旧三组层级：`system-admin/src/main/resources/db/migration/V20261013_170__menu_consolidation.sql`；当前独立AI组与动作：`V20261016_180__ai_config_v04.sql`、`V20261016_210__ai_access_actions.sql`（同目录）。
- 独立AI配置二级页：`V20261018_244__restore_standalone_ai_configuration.sql`复用原菜单与动作授权，恢复`system/ai-config/index`，不新增角色数据权限；迁移后重新登录核对真实导航和API动作。
- 工作台与看板独立入口：`V20261023_300__independent_home_navigation.sql`保留原页面ID和授权，调整层级与排序并修正历史无效图标名；前端只整理后端已经授权的页面。
- 排序兼容修正：`V20261023_301__nonnegative_home_navigation_order.sql`将工作台、看板设为0、1，其余根菜单保留相对顺序，从2开始连续排列，符合菜单编辑接口的非负值要求。已应用的V300保持原校验和，升级使用新增迁移。
