# 从真实模块扩展新页面

面向维护前后端业务模块的开发者。新增需求应先确认业务字段、身份和租户范围；资讯和字典可作为当前实现参考。本教程描述开发流程，不创建新的示例业务或宣称已有多个业务系统采用。

## 页面到数据库的步骤

1. **定义请求/响应**：像NewsChange一样只接受业务字段，ID和creator由服务端决定。说明字段上限、枚举、URL/JSON规则以及是否需要revision。
2. **服务实现**：把校验、事务与数据范围放在服务；参考ContentService的受控列名、绑定参数与不存在错误。它是平台资讯服务，不自动提供租户范围，租户业务须增加认证tenant和资源约束。
3. **Controller**：按ContentNewsController拆list/query/add/edit/remove，精确检查动作；平台资源还使用platformAccess。不要只在页面中判断权限。
4. **数据库**：复用既有表只在需求吻合时进行；需要结构变更时新增Flyway迁移，不改已应用脚本。唯一约束和索引须与实际tenant/业务标识匹配。
5. **API和页面**：在apps/web-ele/src/api下定义类型和路径，再在views新增页面。复用分页/编辑状态，提供只读详情、失败重试和保存失败保留。
6. **菜单/角色**：放入现有合适目录，创建页面与按钮权限；工作台与看板保留一级前两位。默认授权有明确范围，不能给普通租户发平台能力。
7. **验证**：覆盖合法CRUD、错误字段、无权限、跨tenant/资源、并发冲突（若适用）、刷新持久化及菜单深链。正式质量门槛见[质量检查](/operations/quality-gates)。

## 资讯API的真实调用示例

```ts
import type { NewsChange } from '#/api/system/news';
import { createNews, getNews } from '#/api/system/news';

export async function createAndRead(change: NewsChange) {
  const id = await createNews(change);
  return getNews(id);
}
```

在有资讯新增/查询权限的平台会话中使用。它调用真实API、可能写入数据；不要在构建或文档示例校验阶段自动执行。若create成功而get失败，先保存返回ID并检查权限/网络，不重复create。

## 正常结果与常见失败

管理页使用统一页头：`<Page content-class="admin-page">` 中首项为 `AdminPageHeader`（`#/components/admin-page-header.vue`），传入 `title`、可选的简短 `description`，页面级按钮放 `#actions`。不要同时传旧 `Page title/description` 再显示一份页头，也不要在侧栏重复同一个全局操作。桌面内容留白24px、窄屏16px、内容纵向间距16px、标题20px；模型中心、提示词工作区和对话日志保留各自布局，局部操作放在对应模块内。

模块能从菜单进入，刷新不404；保存后读回同一记录。删除失败或读取不存在要显示明确恢复路径。MyBatis租户插件不会自动给所有JdbcTemplate SQL加范围；SQL必须自行联合tenant与资源条件。文件/通知/AI的上下文边界按其专页接入，不以通用CRUD方式复制敏感字段。

## 源码依据

前端 `apps/web-ele/src/api/system/news.ts`、`views/system/news/index.vue`；后端 `system-admin/src/main/java/com/xinghuiTec/controller/ContentNewsController.java`、`content/ContentService.java`；字典参考 `controller/DictionaryAdminController.java`、`service/DictionaryService.java`。菜单最新迁移为 `system-admin/src/main/resources/db/migration/V20261013_170__menu_consolidation.sql`。
