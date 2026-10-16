# 开发候选变更说明

本页向已使用早期候选的开发者、部署者说明保留/退役功能及迁移影响。日期按2026-10-13文档核对，不虚构发行Tag或按任务编号充当产品更新日志。精确提交与验证边界见[版本组合](./versions.md)。

## 2026-10-16：Pages 发布准备

新增静态后台演示与文档的发布路径：[后台目标](https://beidaomitu233.github.io/xinghui-admin-vue3/)、[文档目标](https://beidaomitu233.github.io/xinghui-admin-vue3/docs/)。文档支持构建时 `DOCS_BASE`，默认 `/docs/` 保留，项目路径为 `/xinghui-admin-vue3/docs/`；继续使用完整54页、链接/锚点和产物检查。实际发布是否完成，以[公开仓库 Actions](https://github.com/beidaomitu233/xinghui-admin-vue3/actions)和HTTP验收为准。

演示仅使用浏览器本地示例数据，不提供真实后端、供应商调用或业务持久化证明。静态站点提交不替换下面的应用候选源码配对，也不表示应用正式发行或完整应用 CI 已通过。

## 菜单与工作区

当前菜单为三个一级组：系统管理、通用能力、运行维护。V170迁移整理一级目录和叶子层级，保留实际页面路径及操作码关联；不是新增第四个功能组。本人收件箱在有认证路由的普通账号上仍可见，不能因没有业务菜单丢失个人入口。

中性灰白/暗色工作区表面不随粉色等强调色被整体染色；主题测试覆盖内置强调色和明暗切换、持久化恢复。菜单/主题是前后端组合变更，不能只拷贝CSS而忽略数据库和动态菜单来源。

## 配置与安全默认

服务端连接统一使用DB_URL，自动baseline默认关闭。JWT_SECRET缺失或短值拒绝启动；默认关闭MAIL、OSS和Druid。生产前端API默认同源/api，mock签名密钥必须显式提供，不能使用缺省密钥放行测试。

微信、SMS、OSS使用统一业务配置，支持脱敏状态、加密凭据、revision与清除动作；数据库配置和环境fallback有明确来源。模型凭据支持ENV/DB模式和同一主密钥保护。部署者须保存原CONFIG_MASTER_KEY，不能把更新教程里的生成命令在每次升级重新执行。

## 保留业务与轻量扩展

资讯、公告、字典、用户/角色/菜单、文件、受控批量、调度和本人通知保持。分页计数Long字符串在前端适配为计数，资源ID继续用字符串，避免Snowflake精度损失；无效通知ID不会请求别人的详情。

AI场景支持草稿、已发布版本、声明变量预览与业务注册读取，读取不调用模型供应商。管理员模型测试以outcome/httpStatus区分真实成功、上游429/鉴权失败等。当前有接缝和轻量实现，不代表已经交付通用SDK/所有业务系统集成。

低代码含text、textarea、number、date、select、multiselect、switch，设计/发布schema与已填写记录的版本区分；输入冲突保留，记录按实际form/tenant条件查询。没有匿名公开填写、附件或复杂联动承诺。

## 退役与历史兼容

资料示例、网站内容管理、下载与页面业务模块从当前产品退役，旧表/菜单/授权通过迁移清理；历史V130等文件保留，不能删除已执行迁移来“精简”数据库。曾启用optional资料示例R的环境要保留location，当前R用于清理而非复活示例。

两个web示例模块仅验证装配，不是企业业务系统采用案例。旧文档中“V100未执行”“默认启用MinIO”“自动baseline=true”的状态已过期，入门/升级统一以新文档中心为准。

## 质量与文档

必需job取消/跳过/缺失均不能通过汇总；后端必需报告和Boot结构、真实隔离空库服务，前端root/app/auth、类型/lint、实际生产runtime配置均有明确检查。应用质量CI和兼容容器矩阵按对应应用基线记录，Pages Actions 的状态另外核对；本地通过不等于正式后端发行。

文档中心将入门、功能、开发、组件、部署、版本及参与分层，统一正文来源`apps/docs/content`；旧后端文档变为迁移入口，避免两个教程同时漂移。结构参考[Vben](https://doc.vben.pro/guide/introduction/vben.html)、[Pure](https://github.com/pure-admin/pure-admin-doc)、[JeecgBoot](https://help.jeecg.com/)和[芋道](https://doc.iocoder.cn/)，本项目参数/接口/实例从自己源码整理。引用上游结构不引入其功能承诺或当前版本支持声明。

## 升级操作与源码

对比自己的DB history、当前部署提交与这些变化，按[升级](./upgrade.md)和[备份恢复](../operations/backup-restore.md)准备，不从本页直接执行批量数据修正。

源码：`V20261012_140__menu_cleanup.sql`、`V20261012_150__business_config.sql`、`V20261012_160__lowcode_forms.sql`、`V20261013_170__menu_consolidation.sql`；后端当前Controller/服务；前端`src/router/routes-helper.ts`、`src/styles/workspace-theme.css`、`src/api/system/news.ts`与质量脚本。迁移文件均在后端`system-admin/src/main/resources/db/migration/`。
