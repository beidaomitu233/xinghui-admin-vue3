# 阅读路径

## 用途与前置

根据你在项目中的身份，选择一条能得到具体结果的路径。本页适合首次接手者，也适合从应用“当前页面帮助”进入但不知道下一步读什么的用户。阅读不要求登录；执行管理操作、配置密钥、调用 API 时仍遵守对应页面权限和环境要求。

## 只想体验和阅读

可从[星辉后台](https://admin.hui7.fun/)和[文档中心](https://admin.hui7.fun/docs/)开始；服务器首次部署验收进行中，实际可用性以验收记录为准。GitHub Pages 已停止后续演示发布，旧站点仅保留历史快照。发布记录见[公开仓库 Actions](https://github.com/beidaomitu233/xinghui-admin-vue3/actions)；自行部署仍按下面的安装、权限和部署路径执行。

## 管理人员：先完成一条操作链

1. 阅读[账号与用户](../features/accounts.md)，确认当前账号角色和操作权限。
2. 在[四个菜单组](../features/menus.md)中找到功能：系统管理、通用能力、运行维护、AI管理；按需要阅读[字典管理](../features/dictionary.md)、[系统参数](../features/parameters.md)、[资讯](../features/news.md)或[AI一期](../features/ai.md)。实际菜单由当前身份授权决定。
3. 管理业务配置前，核对[业务配置](../features/business-config.md)的平台身份及敏感值不回显规则。
4. 阅读[导入导出](../features/bulk.md)再上传用户表格；角色字段和新账号激活步骤不能跳过。

正常结果是完成一次查询、保存和刷新核对，而不是只看到成功提示。若菜单不存在，检查授权；若保存报冲突，重新读取当前 revision 后再操作。不要重置密码、重复发送短信或重复调用模型来验证无关页面。

## 普通业务使用者：个人入口与授权业务

从[个人通知](../features/notifications.md)了解未读、详情和已读操作。仅有本人通知的账号会看到只含个人收件箱的通用组；这不授予通知模板、业务配置或模型管理权限。

如需要填写表单，先取得[低代码表单](../features/lowcode.md)说明的发布表单与记录权限，再打开填写地址。正常结果是能提交当前发布版本并在获权记录页面读取；没有发布、没有记录操作码或不在数据范围内时应联系管理员，而不是寻找匿名入口。

## 开发者：从现有模块理解契约

| 顺序 | 要读什么 | 可核对的成果 |
| --- | --- | --- |
| 1 | [快速开始](../guide/quickstart.md)、[运行配置](../guide/configuration.md)、[运行验证](../guide/verification.md) | 在自己的环境启动并完成最小验证 |
| 2 | [结构](../development/structure.md)、[路由权限](../development/routes-permissions.md) | 找到页面、API、服务和操作码的实际位置 |
| 3 | [API约定](../reference/api-conventions.md)、[错误码](../reference/error-codes.md) | 正确处理HTTP/业务码、数字串ID和冲突 |
| 4 | [分页](../components/paged-list.md)、[编辑详情](../components/edit-detail.md)、[反馈](../components/feedback.md) | 复用当前组件的真实参数、事件和失败状态 |
| 5 | [新增模块](../development/module-extension.md)、[迁移](../reference/database-migrations.md) | 明确新增代码/迁移/权限/测试的范围，不重写已执行checksum |
| 6 | [贡献流程](../contributing/contribution.md)、[双仓协作](../contributing/gitflow.md) | 准备可审查的源码配对和验证记录 |

正常结果是可以沿一条真实模块链解释“按钮为什么可用、服务如何校验、失败怎么恢复”。源码片段是学习范式，不代表自动生成的完整SDK，也不假设已接入两个真实业务系统。

## 运维与交付：安装、升级、恢复分别核验

先读[环境](../guide/environment.md)、[部署](../operations/deployment.md)和[安全配置](../operations/security.md)，再读[备份恢复](../operations/backup-restore.md)与[升级](../releases/upgrade.md)。用[候选版本](../releases/versions.md)识别代码配对，按[质量门禁](../operations/quality-gates.md)区分本地报告与远端CI。

真实部署的正常结果是有可访问的管理应用、同源 API、独立静态文档、受保护的凭据和经过恢复核验的备份。默认文档路径 `/docs/`；项目 Pages 使用 `/xinghui-admin-vue3/docs/`，完整步骤见[部署](../operations/deployment.md)。静态站点发布成功不能替代后端安装和恢复核验。

## 搜索与失败恢复

搜索“字典管理”查功能页，搜索 `CONFIG_MASTER_KEY` 查加密配置及恢复说明；使用本页目录在章节内定位。没有结果时按侧栏分类阅读，或确认文档产物是否落后于应用源码。

应用的帮助链接按当前路由映射到已定义章节，不把路由 query、手机号或登录令牌拼到地址里。若帮助页404，先检查 `/docs/` 静态挂载、章节 `.html` 文件和部署版本。不能靠清空登录、权限或语言存储来修正文档部署。未知功能会回到通用阅读说明，不生成未经验证的新文档地址。

## 实际源码来源

- 前端 `apps/docs/.vitepress/chapters.mjs`：分类与应用路由帮助映射。
- 前端 `apps/web-ele/src/layouts/documentation.ts`、`basic.vue`：安全文档地址、当前帮助、版本入口。
- 前端 `apps/web-ele/src/router/routes-helper.ts`：个人入口和动态业务菜单分开。
- 前端 `apps/web-ele/src/views/_core/about/index.vue`：项目候选版本与上游版本分开说明。
