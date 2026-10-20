---
layout: home
title: 文档首页
hero:
  name: 星辉后台
  text: 使用与开发指南
  tagline: 快速上手、功能操作、组件扩展与部署维护。
  actions:
    - theme: brand
      text: 开始使用
      link: /guide/quickstart
    - theme: alt
      text: 查看功能边界
      link: /overview/capabilities
features:
  - title: 使用已有能力
    details: 用户、角色、字典、通知、文件、AI配置、表单与资讯，按身份和授权操作。
    link: /features/accounts
  - title: 从源码扩展
    details: 对照页面、接口、服务、迁移与测试，理解现有组件的参数和失败状态。
    link: /development/module-extension
  - title: 自己部署与维护
    details: 分开管理应用、API和静态文档，明确配置、备份、升级及质量门禁。
    link: /operations/deployment
---

## 先选一个阅读入口

这份文档面向管理人员、业务使用者、开发者和部署维护者。阅读公开文档不需要登录；操作管理应用仍需要有效登录、操作权限和符合接口要求的身份。

| 你的目标 | 从这里开始 | 正常结果 |
| --- | --- | --- |
| 首次运行项目 | [快速开始](guide/quickstart.md) → [运行验证](guide/verification.md) | 连接自己配置的数据库、缓存和 API，完成登录与最小验证 |
| 使用管理页面 | [功能手册](features/accounts.md) → [四个菜单组](features/menus.md) | 能找到当前身份实际获权的入口，不把菜单显示当成服务端授权 |
| 新增功能 | [项目结构](development/structure.md) → [新增模块](development/module-extension.md) | 知道应修改哪层代码、怎样增加迁移和验证权限 |
| 复用页面组件 | [组件概览](components/overview.md) | 找到本项目实际适配与组件契约，而不是照搬上游示例 |
| 上线或升级 | [部署](operations/deployment.md) → [备份恢复](operations/backup-restore.md) → [升级](releases/upgrade.md) | 形成可回滚、可核验的部署组合 |
| 确认交付状态 | [候选版本](releases/versions.md) → [质量门禁](operations/quality-gates.md) | 区分代码实现、本地验证、供应商联调与正式 CI |

## 怎样检索

点击顶部“搜索文档”，或按 `Ctrl+K`（macOS 使用 `⌘K`），输入功能名称，例如“字典管理”；部署配置可搜索 `CONFIG_MASTER_KEY`。结果来自随站点发布的本地全文索引，无需外部搜索服务。选择结果进入章节，右侧“本页目录”可直接跳转到具体规则。按 `Esc` 关闭搜索。

如果没有结果，换用页面实际名称或配置键，去相应分类侧栏查找。静态站点离线缓存未更新时，应刷新页面并确认应用与文档的候选版本匹配；不要为了查文档删除登录存储。

## 文档与运行状态

当前服务器入口为[星辉后台](https://admin.hui7.fun/)和[文档中心](https://admin.hui7.fun/docs/)，首次部署验收进行中，实际可用性以 HTTP 与业务验收记录为准。GitHub Pages 已停止后续演示发布，旧站点保留为历史快照；发布记录见[公开仓库 Actions](https://github.com/beidaomitu233/xinghui-admin-vue3/actions)。Pi Agent 服务与 AI 工作台仍为方案及独立原型，尚未实际接入。

v1.2.0是已发布静态旧快照；[当前源码组合](releases/versions.md)的一期AI已通过正式CI、MySQL5.7/8.0服务矩阵与真实记录摘要闭环，尚未为该AI源码建立独立发行Tag。源码默认四个一级组为系统管理、通用能力、运行维护、AI管理；实际显示仍按身份授权过滤。页面存在不代表所有供应商已接通，真实微信扫码、短信发送与独立机器验证仍有边界，见[能力清单](overview/capabilities.md)。Agent与插件执行尚未交付。

本轮实用操作见[AI对话、配置与数据库引用](features/ai.md)：独立AI配置页的命名渠道、多Key/多模型与目录扫描，完整对话，以及实际字段/整表/关联子行预览。本轮配置、数据预览、引用保存和对话阅读已原生验证；扫描不等于生成验证，真实供应商限制见[版本组合](releases/versions.md)。

文档只有一个正文来源：前端仓库 `apps/docs/content/`。默认静态基路径为 `/docs/`，子目录托管可通过 `DOCS_BASE` 设置完整路径；章节使用 `.html` 地址。默认“文档中心、当前页面帮助、版本说明”入口不携带用户信息或 API 凭据。部署失败时按[故障排查](operations/troubleshooting.md)检查静态目录和反向代理，不把文档 404 当成登录失效。

## 核对来源

- 站点包及命令：前端 `apps/docs/package.json`。
- 分类和章节合同：前端 `apps/docs/.vitepress/chapters.mjs`。
- 搜索、基路径和导航：前端 `apps/docs/.vitepress/config.mts`、`search.mjs`。
- 应用入口：前端 `apps/web-ele/src/layouts/basic.vue`。
- 本站构建机制参考 [VitePress 1.x 文档](https://vuejs.github.io/vitepress/v1/guide/getting-started)，本地全文搜索参考[官方搜索说明](https://vuejs.github.io/vitepress/v1/reference/default-theme-search)。
