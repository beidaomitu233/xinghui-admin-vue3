# 星辉后台 · 静态演示与文档

> **[打开后台演示](https://beidaomitu233.github.io/xinghui-admin-vue3/)** · **[打开完整文档](https://beidaomitu233.github.io/xinghui-admin-vue3/docs/)**

这是星辉后台的**静态演示部署仓库**，用于 GitHub Pages 托管审核后的界面与文档。入口是否已可访问，以本仓库 Pages 部署状态为准；不将尚未成功的工作流称为发布成功。

## 演示范围

- 示例数据只在当前浏览器保存，与任何真实用户、业务数据库和生产账号无关。
- 按页面提供的演示入口浏览三个一级菜单及支持的本地操作；不支持的操作会明确提示，不伪装成真实成功。
- 不托管后端，不连接真实 API、模型供应商、对象存储、微信或短信；演示登录不是生产认证。
- 刷新可能保留本浏览器示例数据；浏览器存储不是备份，其他浏览器/设备不会同步。
- 文档描述真实项目源码及部署方法，其中的后端配置示例不表示此 Pages 站点提供这些服务。

这是开发演示，不代表正式发行版本、完整外部链路验收或生产服务承诺。请勿输入真实凭据或敏感数据。

## 目录与校验

```text
site/                       # 审核后的完整静态应用及 docs/，由维护者更新
scripts/check-site.mjs       # Node.js 原生静态产物门槛，无应用工作区依赖
scripts/check-site.test.mjs  # 坏产物/不安全引用的受控拒绝测试
.github/workflows/pages.yml # 校验与 GitHub Pages 部署
LICENSE                     # 保留的 Vben MIT 许可
ATTRIBUTION.md               # 上游与派生归属
THIRD_PARTY_NOTICES.md        # 已核对的主要依赖；不是完整传递依赖清单
```

使用 Node.js 22 或更高的兼容版本，无需安装整个应用工作区：

```bash
node --test scripts/check-site.test.mjs
node scripts/check-site.mjs site
```

`site/` 必须包含真实应用首页、完整54篇文档、正确项目基路径、静态演示 manifest/适配标记及所引用资源。缺少产物会失败，不生成占位首页或跳过文档检查。源码、历史、服务端配置、日志与内部协作材料不放入此目录。

部署基路径固定为 `/xinghui-admin-vue3/`，文档为 `/xinghui-admin-vue3/docs/`。更新应用和文档后重新运行门槛，记录审核的来源版本与产物摘要；静态扫描不替代浏览器交互和网络验收。

## 发布流程

PR、`develop`、`feature/**`、`release/**` 只进行校验。只有本仓库 `main` 的 push 且门槛通过，才上传 `site/` 并部署至 `github-pages` 环境；其他分支和 PR 不拥有 Pages/OIDC 写权限。

维护者在仓库 Settings → Pages 选择 GitHub Actions，并为 `github-pages` 环境限制部署分支。工作流生成 `.nojekyll`，使用官方 configure/upload/deploy-pages actions，不需要个人访问令牌或后端密钥。必须核对实际 Actions 结果和两处入口的 HTTP/浏览器表现后，才记录一次成功部署。

## 上游归属

界面基于 [Vben Admin](https://github.com/vbenjs/vue-vben-admin) 派生，保留原 [MIT License](LICENSE) 与 Copyright (c) 2024-present, Vben。项目文档和演示适配属于星辉项目的整理与扩展；此仓库不是 Vben 官方发布仓库。依赖的原有版权及许可继续适用，参见 [归属说明](ATTRIBUTION.md)与[主要第三方声明](THIRD_PARTY_NOTICES.md)。这份主要依赖清单不代表完整依赖或后端历史审计。
