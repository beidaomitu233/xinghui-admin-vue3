# 部署应用与文档中心

本页向部署者提供 JAR、静态应用、同源文档和 GitHub Pages 手册部署方式。运行真实后端前完成自有环境的密码处理、备份、版本配对和[质量门槛](./quality-gates.md)。Pages 发布状态按公开仓库实际 Actions 与 HTTP 检查确认；静态站点发布不等同于后端正式发行。

## GitHub Pages：静态演示与文档 {#github-pages}

发布目标为[后台演示](https://beidaomitu233.github.io/xinghui-admin-vue3/)与[文档中心](https://beidaomitu233.github.io/xinghui-admin-vue3/docs/)。首次发布是否完成，以[公开仓库 Actions](https://github.com/beidaomitu233/xinghui-admin-vue3/actions)和实际访问结果为准，本教程不预先宣称链接已通过 HTTP 验收。

Pages 只托管浏览器本地示例界面及静态手册，不运行 JAR、数据库、Redis，也不提供真实 AI、OSS、微信或短信操作。演示数据及模拟结果不能作为后端权限、持久化或供应商成功证据；真实部署继续按本页后续章节执行。

### 设置完整站点路径

文档默认 `DOCS_BASE` 未设置时为 `/docs/`。项目 Pages 必须设置完整路径 `/xinghui-admin-vue3/docs/`，只设 `/xinghui-admin-vue3/` 会把文档挂到后台演示入口。该值是构建时路径，部署到不同前缀需要重新构建；构建后仅移动目录不能改写已生成的资源地址。

从前端仓库根目录执行 Bash：

```bash
pnpm install --frozen-lockfile
DOCS_BASE=/xinghui-admin-vue3/docs/ pnpm docs:check
DOCS_BASE=/xinghui-admin-vue3/docs/ pnpm --filter @xinghui/docs test
DOCS_BASE=/xinghui-admin-vue3/docs/ pnpm --filter @xinghui/docs build
DOCS_BASE=/xinghui-admin-vue3/docs/ pnpm --filter @xinghui/docs preview
```

PowerShell 中保持相同变量到预览结束，随后恢复原值：

```powershell
$previousDocsBase = $env:DOCS_BASE
try {
    $env:DOCS_BASE = '/xinghui-admin-vue3/docs/'
    pnpm docs:check
    if ($LASTEXITCODE -ne 0) { throw 'Documentation content check failed' }
    pnpm --filter @xinghui/docs test
    if ($LASTEXITCODE -ne 0) { throw 'Documentation tests failed' }
    pnpm --filter @xinghui/docs build
    if ($LASTEXITCODE -ne 0) { throw 'Documentation build failed' }
    pnpm --filter @xinghui/docs preview
} finally {
    $env:DOCS_BASE = $previousDocsBase
}
```

`DOCS_BASE` 必须以 `/` 开头和结尾，路径段只允许 ASCII 字母、数字、下划线、连字符；拒绝 origin、query、fragment、点段、反斜杠、重复斜杠和百分号编码。构建仍要求完整54页、链接、锚点及公开产物检查，不使用 partial 产物发布。

### 组织静态发布目录

文档输出仍是 `apps/docs/.vitepress/dist/`。把其中内容放入静态发布根的 `docs/`，同时根目录放经审查的显式演示构建产物：

```text
发布根/
  index.html                 后台演示
  assets/                    后台演示资源（以实际产物为准）
  docs/index.html             文档首页
  docs/404.html               文档404
  docs/assets/                文档与本地搜索资源
  docs/features/lowcode.html  文档深页示例
```

仓库名是 Pages URL 前缀，不再在发布根里套一层 `xinghui-admin-vue3/`。后台演示必须由其显式演示模式构建，不能把普通生产前端接入 `/api` 的产物当作浏览器本地演示。公开目录只放审核过的静态文件、必要归属与部署配置，不复制源码历史、私有配置、源码映射、运行日志或内部交付资料。

公开 Pages 的 PR 只做产物校验，部署由审查后的 main 变更触发；具体工作流和最小权限以公开仓库实际配置为准。应用质量 CI、数据库容器矩阵与独立机器验证按对应应用版本单独记录，Pages 的 Actions 成功不能替代这些验证。

### 发布验收与404

核对首页及 `/docs/features/lowcode.html` 直接打开/刷新、favicon、侧栏、面包屑、上一篇/下一篇、本地“字典管理”和 `CONFIG_MASTER_KEY` 搜索；请求必须保留完整项目前缀。搜索缺资源时检查 `docs/assets/chunks/` 是否完整上传，不把本地搜索改成外部服务绕过问题。

文档生成自己的 `docs/404.html`。GitHub Pages 对整个项目使用发布根的 `404.html`；发布组合流程负责该根级兜底，不能假设子目录的404文件会自动处理所有深层缺页。部署后应分别直接访问文档404和不存在的文档URL，以实际 HTTP 状态及页面行为确认。发布失败时保留上一次已验证产物，先修正 base/文件布局再重新发布。

## 产物与配置分离

| 产物 | 来源 | 部署位置示例 |
| --- | --- | --- |
| 后端可执行 JAR | `system-admin/target/system-admin.jar` | `/srv/xinghui/app/system-admin.jar` |
| 管理前端 | `apps/web-ele/dist/` | `/srv/xinghui/www/` |
| 文档站 | `apps/docs/.vitepress/dist/` | `/srv/xinghui/www/docs/` |
| 私有配置/密钥 | 部署者的秘密管理 | `/etc/xinghui/`，不在www目录 |

目录示例不是本项目固定路径，可按自己的基础设施修改。记录后端/前端/文档提交及每个产物SHA256；应用版本与文档版本必须说明对应关系，不能只复制一个旧 `dist.zip`。

## 构建

在后端根目录设置本环境所需变量后构建；在前端根目录冻结安装并执行应用质量构建。大型任务按环境资源串行运行。

```bash
# backend 根目录；使用稳定且私有的实际配置，不重生主密钥。
mvn -B -ntp clean package
```

```bash
# frontend 根目录
pnpm install --frozen-lockfile
node scripts/build-quality.mjs
pnpm docs:check
pnpm --filter @xinghui/docs build
```

`build-quality.mjs` 使用单任务、默认2GiB、强制实际构建，并执行生成的 `_app.config.js` 验证 API 为 `/api`；有个人 `.env.production.local` 时拒绝覆盖。文档检查要求所有 A/B/C 章节存在且链接/锚点正确，单独 B 正文分支不能作为完整产物。

不使用旧脚本的8GiB默认值来判断自己机器必需内存，不把容器CI文件当成已经完成的生产编排。容器部署需固定镜像、持久卷与网络，另行核对运行版本；本轮容器兼容矩阵未运行。

## 后端服务

提供私有环境文件，例如 `/etc/xinghui/runtime.env`，包含 `DB_URL/DB_USERNAME/DB_PASSWORD`、Redis变量、`JWT_SECRET`、原有 `CONFIG_MASTER_KEY`。内容不能复制到文档、web根目录或公开日志。设置私有外部 YAML 的 `server.address=127.0.0.1`，由本机Nginx反代；容器/远程反代则按实际内网监听。

systemd示例可保存为自己的服务单元，并将用户/路径替换为实际值：

```ini
[Unit]
Description=Xinghui Admin
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=xinghui
Group=xinghui
WorkingDirectory=/srv/xinghui/app
EnvironmentFile=/etc/xinghui/runtime.env
ExecStart=/usr/bin/java -Xms256m -Xmx1024m -jar /srv/xinghui/app/system-admin.jar --spring.config.additional-location=file:/etc/xinghui/application-private.yml
Restart=on-failure
RestartSec=5
UMask=0027

[Install]
WantedBy=multi-user.target
```

这是资源示例，不是项目承诺的生产容量。环境文件限部署者/服务账号读取，写权限限部署流程；JWT/配置主密钥重启复用。先检查数据库/Redis与Flyway日志，再开放代理。正式数据库连接使用由基础设施验证的TLS和最小schema权限；不能把快速开始的本机 `useSSL=false` 复制到公网数据库。

## 同源 `/api` 与 `/docs/`

将应用dist内容放到web根，将文档dist内容放到web根的 `docs` 子目录。以下Nginx示例使用已配置的HTTPS证书，替换域名和证书路径后先运行 `nginx -t`。

```nginx
server {
    listen 443 ssl;
    server_name admin.example.com;
    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    root /srv/xinghui/www;
    include /etc/nginx/mime.types;

    client_max_body_size 21m;

    location = /docs { return 308 /docs/; }
    location ^~ /docs/ {
        try_files $uri $uri.html $uri/ =404;
        error_page 404 /docs/404.html;
    }
    location = /_app.config.js {
        add_header Cache-Control "no-store" always;
        try_files $uri =404;
    }
    location /api/ {
        proxy_pass http://127.0.0.1:7799/;
        proxy_set_header Host $host;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

`proxy_pass`末尾斜杠使 `/api/user/info` 转为后端 `/user/info`。文档用自己生成的深页文件或 `.html`，缺页返回文档404，不能回退应用SPA首页；`/docs/`静态资源和搜索索引必须一同部署。应用当前默认hash路由，但此SPA回退也为后续history部署保留正确基础。

文件上传的应用限制是20MiB；示例使用21m请求上限容纳multipart边界，同时保留后端20MiB文件校验。用户导入仍由自身5MiB文件/6MiB请求限制控制。不要放开到无限上传来解决413。

## 验收与更新

检查应用登录同源请求、当前 `_app.config.js`、文档首页与深页刷新、搜索、404、移动导航和应用帮助链接。发布新前端时保留旧哈希资源一段合理过渡期、刷新HTML/runtime配置，避免旧浏览器请求到已删除chunk。密钥文件不得进入公开产物。

升级通过新的产物目录/链接切换实施，并依[升级流程](../releases/upgrade.md)处理数据库和恢复点。Nginx片段经静态审核，不替代自己域名/证书/权限环境的实际部署验收。应用质量 CI、Pages 部署及正式后端发行分别记录，不能用任一项的成功替代其他项。

## 源码依据

后端 `system-admin/pom.xml`、`system-admin/src/main/resources/application.yml`；前端 `scripts/build-quality.mjs`、`apps/web-ele/.env.production`、`apps/web-ele/vite.config.mts`；文档中心包/输出合同 `apps/docs/package.json`、`apps/docs/.vitepress/`。其他配置要求见[配置说明](../guide/configuration.md)。
