# 代码结构与功能定位

适用于第一次接手本项目的开发者。先完成[快速开始](/guide/quickstart)，确认运行的是当前前后端候选；文档中的源码路径均相对于对应仓库，不是本机路径或已发布源码浏览器链接。

## 前端分层

| 路径 | 职责 |
| --- | --- |
| `apps/web-ele/src/views/` | 当前后台页面及局部状态 |
| `apps/web-ele/src/api/` | DTO类型、真实路径、requestClient调用 |
| `apps/web-ele/src/composables/` | 分页、字典、编辑和确认状态 |
| `apps/web-ele/src/adapter/` | Element Plus组件、Vben Form/VXE接入 |
| `apps/web-ele/src/router/` | 核心路由、后端菜单转换、隐藏业务路由 |
| `packages/@core/`、`packages/effects/` | 上游封装及本地共享能力，不为单页随意改接口 |
| `apps/docs/content/` | 唯一文档正文来源 |

## 后端分层

`system-admin`提供应用启动、Controller和当前功能服务；`system-framework`承载认证过滤器等框架接缝；`common`中的core、tenant、security、redis、oss等模块提供基础能力。业务目录包括content（目前仅资讯）、lowcode、ai、notification、quartz、businessconfig。

`system-admin/src/main/resources/db/migration/`保存版本迁移，optional-migration保存显式可选迁移。旧已应用版本不能因文档重整改checksum；新扩展新增版本并验证空库和升级。[迁移约定](/reference/database-migrations)另有详细说明。

## 从页面追到服务

以资讯为例：`views/system/news/index.vue`调用`api/system/news.ts`，落到`ContentNewsController`，由`content/ContentService`校验字段并访问既有sys_news。字典管理与业务读取分为两个Controller；低代码Schema和记录有独立服务范围；不要根据相似页面名推断共用同一个权限。

正常定位应能找到请求DTO、动作权限、服务字段限制及测试。找不到业务实现时先确认它是否已经移除：资料示例、网站、下载、页面业务模块不能从旧任务或历史路径重新当作当前能力。

## 源码依据与恢复

核对 `apps/web-ele/src/api/system/news.ts`、`system-admin/src/main/java/com/xinghuiTec/controller/ContentNewsController.java`、`content/ContentService.java`。当接口路径与旧教程不一致时以当前Controller和API为准，更新文档与调用方；不要建另一套初始架构文件掩盖版本差异。
