# 项目结构

## 后端

```text
system-admin/      应用启动、管理接口、业务服务、AI 配置与工具适配
system-agent/      AgentScope Harness 绑定、工具契约、会话与任务编排
system-framework/  认证与框架配置
common/            核心、缓存、租户、存储、短信、邮件等基础模块
web-admin/         管理端模块
web-app/           应用端模块
```

AI 主要代码位于 `system-admin/.../ai`：config/modelhub 负责供应商与业务模型，scene 管理场景，application 管理调用与统计，agent 提供业务适配和扩展，hub 负责中台接入。

迁移统一放在 `system-admin/src/main/resources/db/migration`。

## 前端

```text
apps/web-ele/src/
  views/          业务页面
  api/            接口与类型
  adapter/        Vben Form、VXE、Element Plus 适配
  router/         路由与菜单
  views/ai/       Agent 对话
apps/docs/        文档站
packages/         Vben 共享组件与工程能力
```

页面优先使用已有适配器与上游组件。新增业务无需重写表单、表格、弹窗和 Loading。
