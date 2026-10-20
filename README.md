# 星辉后台 · 前端源码与文档

> **[打开后台](https://admin.hui7.fun/)** · **[打开完整文档](https://admin.hui7.fun/docs/)**

服务器入口已确定，首次部署验收进行中；可用性与实际接入功能以验收记录为准。GitHub Pages 已停止后续演示发布，旧站点保留为历史快照。

本仓库承载星辉后台的前端源码与同源文档。`site/` 保留历史审核静态产物，后续真实应用与文档改由服务器流水线发布。

`v1.2.0` 是保留的历史静态快照，当前源码更新未新增版本标签。AI 管理包含完整对话、独立模型中心及提示词工作区：业务模型映射多个供应商渠道，支持多 Key、多模型、目录扫描与持久化、优先级/轮询及预算内故障切换；提示词可通过受限 SQL 助手引用授权数据，使用彩色双语变量。支持 OpenRouter、DeepSeek、OpenAI、SiliconFlow 四家官方地址，任意自定义兼容地址暂不开放。

历史 Pages 演示使用虚构数据，不运行真实模型。目录扫描与真实生成分别验证；实际测试、外部服务限制及源码配对见[版本组合](apps/docs/content/releases/versions.md)。历史站点产物来源记录在 `publication.json`，源码 CI、镜像发布与服务器验收分别核对。

Pi Agent 服务与 AI 工作台仍为方案及独立交互原型，尚未作为实际接入功能发布。

## 源码开发

使用 pnpm **10.28.1**；Node.js 使用 **20.19+ 的 20.x** 或 **22.12+ 的 22.x**，并遵循仓库 `.node-version` 和 CI 的固定版本。

```bash
pnpm install --frozen-lockfile
pnpm dev:ele
pnpm dev:docs
```

管理应用位于 `apps/web-ele`，共享组件与工具位于 `packages/`，构建和规范配置位于 `internal/`。文档正文统一维护在 `apps/docs/content/`，从[项目简介](apps/docs/content/overview/introduction.md)、[快速开始](apps/docs/content/guide/quickstart.md)和[环境配置](apps/docs/content/guide/environment.md)开始阅读。

开发模式按 `apps/web-ele/.env.development` 的 API 地址连接另外部署的真实后端；本仓库不提供后端服务。按环境文档配置自己的后端和本地环境覆盖文件，勿提交账号、令牌或服务端密钥。`VITE_*` 会进入浏览器产物，不能用于保存秘密。

静态演示使用独立的 `.env.demo` 和浏览器本地适配，与真实后端配置分开。开发模式不会因为公开演示可用而自动获得后端；演示账号和本地示例数据也不能用于真实系统认证。

常用校验与构建命令：

```bash
pnpm check:type
pnpm lint
pnpm --filter @vben/web-ele test
pnpm build:ele
pnpm docs:check
pnpm --filter @xinghui/docs test
pnpm build:docs
```

完整 CI 入口见 `.github/workflows/`，覆盖测试、类型、规范、应用构建和完整文档检查；具体调用和结果以工作流为准。文档构建输出为 `apps/docs/.vitepress/dist`。应用与文档的部署方法见[部署教程](apps/docs/content/operations/deployment.md)，源码构建结果须经过审核后才能更新 `site/`。

## 演示范围

以下仅适用于保留的历史 Pages 静态快照。

- 示例数据只在当前浏览器保存，与任何真实用户、业务数据库和生产账号无关。
- 按页面提供的演示入口浏览系统管理、通用能力、运行维护和 AI 管理四个一级菜单及支持的本地操作；不支持的操作会明确提示，不伪装成真实成功。
- 不托管后端，不连接真实 API、模型供应商、对象存储、微信或短信；演示登录不是生产认证。
- 刷新可能保留本浏览器示例数据；浏览器存储不是备份，其他浏览器/设备不会同步。
- 文档描述真实项目源码及部署方法，其中的后端配置示例不表示此 Pages 站点提供这些服务。

这是开发演示，不代表正式发行版本、完整外部链路验收或生产服务承诺。请勿输入真实凭据或敏感数据。

## 目录与校验

```text
apps/web-ele/               # 管理应用源码
apps/docs/                  # 公开文档源码、检查与构建
packages/                   # 共享组件与工具
internal/                   # 构建、类型与规范配置
site/                       # 审核后的完整静态应用及 docs/，由维护者更新
scripts/check-site.mjs       # Node.js 原生静态产物门槛，无应用工作区依赖
scripts/check-site.test.mjs  # 坏产物/不安全引用的受控拒绝测试
.github/workflows/pages.yml # 仅校验历史静态产物，不再发布 Pages
.github/workflows/server-deploy.yml # 服务器镜像发布与受控部署
LICENSE                     # 保留的 Vben MIT 许可
ATTRIBUTION.md               # 上游与派生归属
THIRD_PARTY_NOTICES.md        # 静态构建依赖声明及源码许可核查范围
```

仅检查已有静态产物可使用 Node.js 22.12+ 的 22.x，无需安装整个应用工作区：

```bash
node --test scripts/check-site.test.mjs
node scripts/check-site.mjs site
```

`site/` 必须包含真实应用首页、完整54篇文档、正确项目基路径、静态演示 manifest/适配标记及所引用资源。缺少产物会失败，不生成占位首页或跳过文档检查。源码、历史、服务端配置、日志与内部协作材料不放入此目录。

历史 `site/` 基路径为 `/xinghui-admin-vue3/`，文档为 `/xinghui-admin-vue3/docs/`；当前服务器应用位于 `/`，文档位于 `/docs/`。构建与部署时记录来源版本和产物摘要；静态扫描不替代浏览器交互和网络验收。

## 发布流程

Pages 工作流对其触发分支和 PR 仅进行静态产物校验，已移除 Pages 上传、部署及对应写权限，不再更新旧站点。

真实应用与文档由 `server-deploy.yml` 在精确 `main` 提交的 CI 通过后发布不可变镜像；服务器部署另受显式开关与私有部署配置控制。源码 CI、镜像入库和服务器可用分别验收，首次服务器验收尚未完成。部署方式见[部署教程](apps/docs/content/operations/deployment.md)。

## 上游归属

界面基于 [Vben Admin](https://github.com/vbenjs/vue-vben-admin) 派生，保留原 [MIT License](LICENSE) 与 Copyright (c) 2024-present, Vben。项目文档和演示适配属于星辉项目的整理与扩展；此仓库不是 Vben 官方发布仓库。依赖的原有版权及许可继续适用，参见[归属说明](ATTRIBUTION.md)与[主要第三方声明](THIRD_PARTY_NOTICES.md)。现有静态构建依赖声明不代表完整源码许可证审计。
