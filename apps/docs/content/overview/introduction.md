# 项目简介

## 用途与适用身份

星辉后台是一个 Spring Boot 管理 API 与 Vue 管理前端组成的开发底座。它提供已有管理功能和可核对的扩展路径，供项目管理者、开发者、运维人员理解当前实现。使用者先读本页，再按[阅读路径](reading-path.md)进入操作或开发教程。

应用中的管理操作需要登录和授权。文档公开阅读不授予接口权限，也不会加载用户的登录令牌。项目没有部门、岗位或组织树授权管理器；角色和菜单/操作码是当前授权模型。

## Pages 静态阅读与体验

本次静态发布目标为[后台演示](https://beidaomitu233.github.io/xinghui-admin-vue3/)和[文档中心](https://beidaomitu233.github.io/xinghui-admin-vue3/docs/)。部署状态以[公开仓库 Actions](https://github.com/beidaomitu233/xinghui-admin-vue3/actions)及实际 HTTP 验收为准，不在发布前宣称目标链接已验证。

演示只使用浏览器本地示例数据，手册是静态阅读内容；它们不连接真实后端或供应商，也不等于后端正式发行或完整应用质量 CI。下文源码基线、配置和权限教程仍面向真实应用，不用演示构建提交替换其依据。子路径部署见[部署教程](../operations/deployment.md#github-pages)。

## 两个代码仓库怎样配合

| 代码位置 | 当前职责 | 核对入口 |
| --- | --- | --- |
| 后端 `system-admin` | 登录、管理 API、业务服务、Flyway 迁移 | `system-admin/src/main/java/com/xinghuiTec/controller` 和 `src/main/resources/db/migration` |
| 后端 `system-framework` | 安全与框架配置 | 模块源码；接口的 `@PreAuthorize` 仍是操作边界 |
| 后端 `common` | 响应、缓存和基础工具 | `common/common-core` 等子模块 |
| 后端 `web-admin`、`web-app` | 示例启动模块 | 根 `pom.xml` 的模块列表；不是完整业务应用交付证明 |
| 前端 `apps/web-ele` | Element Plus 管理应用和本项目页面 | `src/views`、`src/api`、`src/composables` |
| 前端 `packages`、`internal` | Vben 派生组件、适配、工程配置 | 每个包的实际导出与本项目使用位置 |
| 前端 `apps/docs/content` | 统一公开文档正文 | 本站所有章节，不复制维护旧后端教程 |

当前源码四个一级菜单是“系统管理、通用能力、运行维护、AI管理”，同组直接列出已授权功能；仍有效页面沿用原地址。v1.2.0静态旧快照的三组布局属于旧基线，不用于判断当前源码缺少AI入口。个人收件箱是已认证的个人入口，没有通用配置权限的用户也可看到只含个人入口的通用组。详见[菜单](../features/menus.md)和[授权](../features/authorization.md)。

## 第一次接手时做什么

1. 确认前后端候选 commit 配对，而不是只读前端包版本或 Maven SNAPSHOT。文档源码依据是后端 `5f4746ddabb4bdeb0eaba74f7808d809b277306c`、前端 `3b6a4141d84b207b5380d667e6100dc585a64d62`；文档站本身随后增加，未创建正式发布 Tag。
2. 按[环境准备](../guide/environment.md)配置工具和自己拥有的数据库、缓存、对象存储；按[运行配置](../guide/configuration.md)设置所需环境变量。不要把仓库示例当成生产凭据。
3. 按[首次登录](../guide/first-login.md)处理初始账号，再完成[运行验证](../guide/verification.md)。
4. 通过[功能边界](capabilities.md)判断哪些能力适合立即使用，哪些需要供应商或部署条件。
5. 增加功能前读[项目结构](../development/structure.md)、[路由与权限](../development/routes-permissions.md)和[迁移](../reference/database-migrations.md)。

正常结果是开发者知道两个仓库各自承担什么、部署版本如何识别，以及一个操作的页面和服务端检查位置。文档的成功示例描述正常流程，不替代你部署环境的验证。

## 本地阅读文档

前端仓库根目录先安装锁定依赖，再启动文档包：

```sh
pnpm install --frozen-lockfile
pnpm --filter @xinghui/docs dev
```

打开命令输出地址的 `/docs/` 路径。发布文档前，使用以下命令检查并构建静态产物：

```sh
pnpm docs:check
pnpm --filter @xinghui/docs build
pnpm --filter @xinghui/docs preview
```

正常结果是首页、侧栏、页内目录与本地全文搜索可用，构建输出 `apps/docs/.vitepress/dist`。有缺章、坏链接或不存在的标题锚点时应修正文档后重跑，不关闭完整检查。按钮“复制代码”复制上面的命令文本；执行前按当前环境阅读相应章节。

## 失败与恢复

- **页面不出现**：先核对当前身份、角色授权及平台访问规则；不要直接在前端添加可见菜单来绕过服务端。相关章节见[租户与平台](../development/tenant-platform.md)。
- **按旧说明访问已删模块**：资料示例、网站管理、下载管理、页面管理已退役；当前保留资讯。不要按旧迁移或任务记录重建这些模块。
- **后台可运行，文档深页 404**：文档是独立静态产物，部署 `/docs/` 和其实际 `.html` 文件；见[部署运维](../operations/deployment.md)。
- **版本名称看起来不一致**：前端包版本沿用上游，后端为 SNAPSHOT；以[候选版本](../releases/versions.md)的源码配对及产物摘要识别部署组合。

## 参考结构与上游归属

本站借鉴 [Vben](https://doc.vben.pro/guide/introduction/vben.html)的分层阅读、[Pure 官方文档源码](https://github.com/pure-admin/pure-admin-doc)的新手教程组织、[Jeecg 文档中心](https://help.jeecg.com/)的功能/开发分类，以及[芋道开发指南](https://doc.iocoder.cn/)的全栈阅读路径。这里只参考组织方式，正文与参数来自星辉实际代码，不复制其业务能力或把项目流行度当成星辉质量证明。

前端派生自 [Vue Vben Admin](https://github.com/vbenjs/vue-vben-admin)，站点使用 [VitePress](https://vuejs.github.io/vitepress/v1/guide/getting-started)。保留仓库已有 LICENSE 和上游归属；当前文档不替代公开发行前的许可确认，也不使用上游仓库作为星辉反馈地址。

## 实际源码来源

- 后端 `pom.xml`：模块和 JDK/Spring Boot 版本。
- 后端 `system-admin/src/main/resources/application.yml`：数据库、Flyway、租户默认配置。
- 后端 `system-admin/src/main/resources/db/migration/V20261013_170__menu_consolidation.sql`：旧基线三个分组和旧地址保留；`V20261016_180__ai_config_v04.sql` 增加独立AI管理，`V20261016_210__ai_access_actions.sql` 补齐相关动作权限。
- 前端 `apps/web-ele/src/router/routes-helper.ts`：动态菜单与受保护个人入口。
- 前端 `apps/web-ele/src/preferences.ts`：后端动态路由模式、默认首页。
