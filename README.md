# 星辉后台 · 前端源码、静态演示与文档

> **[打开后台演示](https://beidaomitu233.github.io/xinghui-admin-vue3/)** · **[打开完整文档](https://beidaomitu233.github.io/xinghui-admin-vue3/docs/)**

本仓库承载星辉后台的前端源码工作区，以及 GitHub Pages 使用的审核静态产物 `site/`。源码变更不会自动更新公开演示；公开内容以实际部署的静态产物为准。

`v1.2.0` 是保留的历史静态快照。当前源码已集成 AI 一期：配置、应用、模板与数据引用、请求日志及低代码记录摘要。当前 Pages 更新展示 AI 独立一级菜单和虚构的只读示例，不运行真实模型；真实摘要需部署配套后端并完成模型与权限配置。此次更新未创建新版本标签，工作区包版本也不等同于本项目发行版本。

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
.github/workflows/pages.yml # 校验与 GitHub Pages 部署
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

部署基路径固定为 `/xinghui-admin-vue3/`，文档为 `/xinghui-admin-vue3/docs/`。更新应用和文档后重新运行门槛，记录审核的来源版本与产物摘要；静态扫描不替代浏览器交互和网络验收。

## 发布流程

Pages 工作流对 PR、`develop`、`feature/**`、`release/**` 只进行静态产物校验。只有本仓库 `main` 的 push 且门槛通过，才上传 `site/` 并部署至 `github-pages` 环境；其他分支和 PR 不拥有 Pages/OIDC 写权限。源码 CI 的校验独立执行，通过源码 CI 不代表已部署。

维护者在仓库 Settings → Pages 选择 GitHub Actions，并为 `github-pages` 环境限制部署分支。工作流生成 `.nojekyll`，使用官方 configure/upload/deploy-pages actions，不需要个人访问令牌或后端密钥。必须核对实际 Actions 结果和两处入口的 HTTP/浏览器表现后，才记录一次成功部署。

## 上游归属

界面基于 [Vben Admin](https://github.com/vbenjs/vue-vben-admin) 派生，保留原 [MIT License](LICENSE) 与 Copyright (c) 2024-present, Vben。项目文档和演示适配属于星辉项目的整理与扩展；此仓库不是 Vben 官方发布仓库。依赖的原有版权及许可继续适用，参见[归属说明](ATTRIBUTION.md)与[主要第三方声明](THIRD_PARTY_NOTICES.md)。现有静态构建依赖声明不代表完整源码许可证审计。
