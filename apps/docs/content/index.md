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
| 使用管理页面 | [功能手册](features/accounts.md) → [三个菜单组](features/menus.md) | 能找到当前身份实际获权的入口，不把菜单显示当成服务端授权 |
| 新增功能 | [项目结构](development/structure.md) → [新增模块](development/module-extension.md) | 知道应修改哪层代码、怎样增加迁移和验证权限 |
| 复用页面组件 | [组件概览](components/overview.md) | 找到本项目实际适配与组件契约，而不是照搬上游示例 |
| 上线或升级 | [部署](operations/deployment.md) → [备份恢复](operations/backup-restore.md) → [升级](releases/upgrade.md) | 形成可回滚、可核验的部署组合 |
| 确认交付状态 | [候选版本](releases/versions.md) → [质量门禁](operations/quality-gates.md) | 区分代码实现、本地验证、供应商联调与正式 CI |

## 怎样检索

点击顶部“搜索文档”，或按 `Ctrl+K`（macOS 使用 `⌘K`），输入功能名称，例如“字典管理”；部署配置可搜索 `CONFIG_MASTER_KEY`。结果来自随站点发布的本地全文索引，无需外部搜索服务。选择结果进入章节，右侧“本页目录”可直接跳转到具体规则。按 `Esc` 关闭搜索。

如果没有结果，换用页面实际名称或配置键，去相应分类侧栏查找。静态站点离线缓存未更新时，应刷新页面并确认应用与文档的候选版本匹配；不要为了查文档删除登录存储。

## 文档与运行状态

本次 Pages 发布目标为[后台静态演示](https://beidaomitu233.github.io/xinghui-admin-vue3/)和[文档中心](https://beidaomitu233.github.io/xinghui-admin-vue3/docs/)，实际部署状态以[公开仓库 Actions](https://github.com/beidaomitu233/xinghui-admin-vue3/actions)及 HTTP 验收为准。静态演示使用浏览器本地示例数据，不连接真实后端或供应商；这次发布不等同后端正式发行或完整应用质量 CI。

当前是开发候选文档，不是正式发行或企业采用证明。页面存在不代表所有供应商已接通；微信网站真实扫码、短信发送、远端 CI 与独立机器验证的限制见[能力边界](overview/capabilities.md)。本机站点可访问也不等于已公开互联网发布。

文档只有一个正文来源：前端仓库 `apps/docs/content/`。默认静态基路径为 `/docs/`，子目录托管可通过 `DOCS_BASE` 设置完整路径；章节使用 `.html` 地址。默认“文档中心、当前页面帮助、版本说明”入口不携带用户信息或 API 凭据。部署失败时按[故障排查](operations/troubleshooting.md)检查静态目录和反向代理，不把文档 404 当成登录失效。

## 核对来源

- 站点包及命令：前端 `apps/docs/package.json`。
- 分类和章节合同：前端 `apps/docs/.vitepress/chapters.mjs`。
- 搜索、基路径和导航：前端 `apps/docs/.vitepress/config.mts`、`search.mjs`。
- 应用入口：前端 `apps/web-ele/src/layouts/basic.vue`。
- 本站构建机制参考 [VitePress 1.x 文档](https://vuejs.github.io/vitepress/v1/guide/getting-started)，本地全文搜索参考[官方搜索说明](https://vuejs.github.io/vitepress/v1/reference/default-theme-search)。
