# 星辉 2.0 · 前端与文档

以 AI 为核心的应用开发后台，基于 Vue 3、Vue Vben Admin、Element Plus 和 AgentScope WebUI。

[后台](https://admin.hui7.fun/) · [文档](https://admin.hui7.fun/docs/) · [后端源码](https://github.com/beidaomitu233/xinghui-admin-backend)

## 主要功能

- AI 中台：自然语言与图片任务、业务工具、计划与会话。
- 模型与提示词：多供应商模型组、模型排序与兜底。
- 原生 Skill、MCP 和 Dify/FastGPT 外部知识库配置。
- AI 统计：费用、用量、缓存、耗时、首输出与质量评价。
- 多角色、模块动作权限、表单、文件、通知和任务。

## 开发

准备 Node.js 22 LTS、pnpm 10.28.1 和配套后端。

```bash
pnpm install --frozen-lockfile
pnpm dev:ele
pnpm dev:docs
```

后端代理默认 `http://localhost:7799`，可通过 `VITE_DEV_API_TARGET` 调整。

页面优先使用 Vben Form、VXE Table、Modal 与 Element Plus；Agent 执行使用后端官方 AgentScope Harness。

## 构建与部署

```bash
pnpm --filter @vben/web-ele typecheck
pnpm --filter @vben/web-ele test
node scripts/build-quality.mjs
pnpm docs:check
pnpm build:docs
```

通过 GitHub Actions 构建镜像并自动部署服务器，文档随前端发布到 `/docs/`。GitHub Pages 不再发布应用演示。

## 版本

v1.0：2025年11月，后台基础框架。v1.5：2026年7月左右，通用业务与 AI 接入。v2.0：2026年11月，Agent、工具扩展与 AI 统计。详见[版本历程](apps/docs/content/releases/versions.md)。

Vue Vben Admin、Element Plus、AgentScope 等上游归属与许可保留在对应源码与依赖中。
