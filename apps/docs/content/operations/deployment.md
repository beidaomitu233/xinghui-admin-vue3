# 自动部署

应用部署到服务器，文档随前端镜像发布到 `/docs/`。GitHub Pages 不再发布应用演示。

## 发布链路

```text
提交 / PR → CI 测试与构建 → 合并发布分支
         → Actions 构建 GHCR 镜像
         → 固定镜像摘要发送服务器
         → 健康检查 → 更新发布记录
```

前端发布分支为 `main`，后端为 `master`。工作流为 `.github/workflows/server-deploy.yml`，部署工具在后端 `deploy/server`。

## 仓库配置

| 配置                                          | 用途                       |
| --------------------------------------------- | -------------------------- |
| `DEPLOY_TOOLING_SHA`                          | 已审查的后端部署工具提交   |
| `SERVER_DEPLOY_ENABLED`                       | 是否自动部署到服务器       |
| `SERVER_JDK_IMAGE` / `SERVER_JRE_IMAGE`       | 固定后端构建与运行镜像摘要 |
| `SERVER_NGINX_IMAGE`                          | 固定前端容器镜像摘要       |
| `DEPLOY_HOST` / `DEPLOY_PORT` / `DEPLOY_USER` | SSH 部署入口               |
| `DEPLOY_SSH_KEY` / `DEPLOY_KNOWN_HOSTS`       | 限定部署密钥与可信主机     |

密钥存入 GitHub Secrets。服务器运行配置放在 `/etc/xinghui/`；发布状态、镜像清单和历史记录在 `/var/lib/xinghui/`。

## 构建与运行

```bash
# 后端
mvn -B -ntp clean package
# 前端与文档
pnpm install --frozen-lockfile
node scripts/build-quality.mjs
pnpm docs:check
pnpm build:docs
```

构建默认使用 4 GiB Node 堆内存，可通过 `XINGHUI_BUILD_NODE_OPTIONS` 调整。

镜像包含管理应用、文档和发布信息。Nginx 同源代理 `/api/`，并保留 SSE 流式响应。构建发生在 Actions，服务器只拉取并启动固定镜像。

## 发布验证

检查 Actions 发布结果、容器健康、应用登录、文档深页、菜单、AI 统计和一个授权业务查询。查看 `/var/lib/xinghui/current.json` 可核对实际镜像与源码。

## 历史静态站点 {#github-pages}

历史静态入口不再更新。
