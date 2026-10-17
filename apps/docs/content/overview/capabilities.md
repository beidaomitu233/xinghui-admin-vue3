# 能力与边界

## 怎样使用这份清单

本页帮助管理人员和开发者判断当前功能是否覆盖自己的需求。前提是按[运行配置](../guide/configuration.md)完成部署，并使用相应身份和操作权限。代码已实现、本地功能已验证、外部供应商已接通、正式发行可用是不同状态。

下表对应[当前源码配对](../releases/versions.md)，包含已经验收的AI一期。v1.2.0已发布静态旧快照与当前未打独立Tag的AI源码分别记录。清单不承诺所有角色都能访问，也不把后端依赖或配置项当成已完成的产品功能。

## 已有功能入口

| 分组 | 实际能力 | 操作入口与限制 |
| --- | --- | --- |
| 系统管理 | 用户、角色、菜单 | [账号](../features/accounts.md)、[授权](../features/authorization.md)、[菜单](../features/menus.md)；没有新增部门/岗位模型 |
| 系统管理 | 字典管理、系统参数 | [字典](../features/dictionary.md)、[参数](../features/parameters.md)；编码和值的不可修改规则见页面操作说明 |
| 系统管理 | 系统业务配置 | [微信、SMS、OSS单页配置](../features/business-config.md)；服务端要求平台身份和对应操作权限 |
| 通用能力 | 文件管理 | [文件](../features/files.md)；对象存储必须显式配置，关闭时不能假定上传可用 |
| 通用能力（旧链路兼容） | 模型元数据、场景提示词与变量 | [AI](../features/ai.md)；保留旧appKey/sceneKey读取与数据，不自动转换为新应用绑定 |
| AI管理 | 调用监控、提示词配置 | [AI一期工作区](../features/ai.md)；场景直接保存、授权字段与样本、监控内模型/Key设置；改造待组合验收，管理权不替代业务读取与调用权 |
| 低代码记录入口 | 真实AI摘要、人工采纳保存 | [低代码](../features/lowcode.md)；真实模型到SSE、草稿采纳及保存刷新已验收，不是Agent自动写入 |
| 通用能力 | 通知公告、通知模板、个人收件箱 | [通知](../features/notifications.md)；本人收件箱不授予全局模板/配置管理权 |
| 通用能力 | 低代码表单 | [表单](../features/lowcode.md)；平台设计/发布，授权记录操作和数据范围仍由服务端限制 |
| 通用能力 | 资讯管理 | [资讯](../features/news.md)；保留当前实现，其他网站内容模块已退役 |
| 运行维护 | 受控定时任务、调度日志、操作日志 | [调度](../features/scheduler.md)；处理器受控，不能配置任意类或脚本执行 |
| 运行维护 | 工作台、看板 | 已有前端页面；不能把演示图表解释为真实业务分析数据 |
| 用户页面操作 | `.xlsx`导入、模板与导出 | [导入导出](../features/bulk.md)；导入最多1000行/5 MiB，新账号待激活，密码不回显 |

低代码当前支持 `text`、`textarea`、`number`、`date`、`select`、`multiselect`、`switch` 七种字段，草稿与发布版本分开，记录带版本与 revision。未实现联动表达式、附件字段、匿名公开填写或动态生成数据库表。具体字段契约见[表单扩展](../development/lowcode-extension.md)。

## 身份与租户边界

配置类能力不仅检查按钮操作码，也检查平台身份。后端 `tenant.enable` 默认 `false`；启用租户后，不应推断租户用户能够读取全局配置。菜单响应会过滤平台能力，API仍独立检查。前端“隐藏按钮”不能替代授权。

普通登录用户的个人收件箱使用已认证路由和本人通知接口；即使没有通用业务配置菜单，前端可生成只含个人收件箱的通用组。低代码填写/记录操作也不等于取得表单设计权限。细节见[租户与平台](../development/tenant-platform.md)。

## 需要另行验证的外部能力

| 能力 | 当前事实 | 接入前的动作 |
| --- | --- | --- |
| PC网站微信扫码 | 已交付配置、PC授权发起与state校验；真实身份扫码受应用资质与回调条件限制。WX02账号绑定、WX03登录尚未交付 | 按[业务配置](../features/business-config.md)准备合法网站应用及回调，不用公众号测试号代替网站应用，不把授权发起视为绑定或登录成功 |
| SMS | 配置与适配存在；真实供应商发送未作为全部部署的已验证能力 | 配置自己的供应商及模板，控制真实发送测试 |
| 对象存储 | 显式启用后执行文件链路；本地验证不能保证你的存储端点可达 | 设置独立凭据/桶，按[文件手册](../features/files.md)验证上传、读取与恢复 |
| AI模型与业务调用 | 当前一期有真实模型测试及记录摘要闭环，也保留供应商429等失败事实 | 区分测试成功、限流、凭据或网络失败；不将受控故障模拟当真实调用，不保证全部或免费模型持续可用 |
| 质量与发行 | 当前配对源码正式前后端CI与MySQL5.7/8.0服务矩阵已通过；真实业务摘要另行验收 | 按精确源码版本核对证据，目标部署/升级及独立机器仍需验证；Pages静态发布与后端发行分别记录 |

## 不在当前交付范围

工作流、报表设计、组织权限管理器、通用代码生成器、分片断点续传、模型计费平台、Agent、插件执行和知识库不是当前已交付能力。一期已具备通过测试的多Key准入及应用策略范围内的选择/备用，不应再列为全部未实现；它也不等于通用网关或独立计费配额平台。两个独立业务系统真实采用尚未验证。资料示例、网站五模块、下载管理、页面管理已删除，不作为扩展示范恢复。

## 正常判断与失败恢复

选一个需求，先读对应功能操作，再核对[API目录](../reference/api-catalog.md)和[组件参考](../components/overview.md)。能找到实际路由、权限检查和服务代码，才把它作为已有能力使用。

出现403应检查身份和授权，不能清空缓存绕过；外部服务未配置或429不是页面保存必然失败；没有找到对应源码时将其视为建设需求，不凭本页相近词汇判断已实现。错误处理见[错误与恢复](../reference/error-codes.md)。

## 实际源码来源

- 后端 `system-admin/src/main/java/com/xinghuiTec/security/PlatformVisibilityService.java`：平台菜单/权限过滤。
- 后端同模块 `controller/BusinessConfigController.java`、`AiModelTestController.java`、`NotificationInboxController.java`：配置/模型/本人通知边界。
- 后端同模块 `lowcode/LowcodeSchema.java`：`TYPES`、字段校验；`LowcodeFormController.java`、`LowcodeRecordController.java`：设计与记录权限。
- 后端同模块 `controller/ContentNewsController.java`：保留资讯接口。
- 前端 `apps/web-ele/src/views/system/user/index.vue`：导入限制与待激活提示。
- 前端 `apps/web-ele/src/router/routes-helper.ts`、`router/routes/modules/lowcode.ts`：个人入口与隐藏运行页。
