# 维护文档

正文统一在 `apps/docs/content`，导航在 `.vitepress/chapters.mjs`，架构图片在 `apps/docs/public`。

按“是什么、如何使用、如何开发”编写。页面介绍操作入口、步骤和结果；技术细节集中放开发与配置章节。

```bash
pnpm docs:check
pnpm build:docs
```

更新功能时同步操作手册与版本记录。文档随前端镜像部署在 `/docs/`。
