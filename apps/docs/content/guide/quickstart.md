# 快速开始

本页面向首次接手项目的开发者，目标是在自己的空数据库上启动后端和 Element Plus 前端，并完成首次登录。已有业务库请先读[数据库迁移](../reference/database-migrations.md)，不要用试启动代替升级评估。

## 准备两份仓库

准备已获授权的前后端仓库地址，分别检出配套版本；本项目不以 Vben 上游仓库作为自己的后端。当前文档对应的精确提交见[版本组合](../releases/versions.md)。以下目录名是教程约定，可自行调整。

```bash
git clone 'https://git.example.com/your-team/backend.git' backend
git clone 'https://git.example.com/your-team/frontend.git' frontend
```

将两个示例地址换成自己的真实地址。安装 JDK 17、Maven 3.9.x、Node.js 20.19 或更高的兼容版本、pnpm 10.28.1、MySQL 和 Redis；核对命令及数据库版本边界见[环境要求](./environment.md)。

## 建立独立开发数据库

以数据库管理员身份执行以下 SQL。用户名、密码、库名均是可替换的部署示例；不要连已有库初始化，也不要导入历史 `sql/xinghui_admin.sql`。

```sql
CREATE DATABASE xinghui_admin CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER 'xinghui_app'@'127.0.0.1' IDENTIFIED BY 'replace_database_password';
GRANT ALL PRIVILEGES ON xinghui_admin.* TO 'xinghui_app'@'127.0.0.1';
```

应用启动时需要在该 schema 创建/变更表。这里授予的是专属 schema 权限，不是服务器全局权限。准备独立 Redis 实例或数据库，并设置认证；如使用容器，数据库与密码要与应用配置一致。教程不替你创建或清理共享服务。

## 配置并启动后端

从 `backend` 根目录执行。先将占位密码替换为刚建立的数据库和 Redis 凭据。JWT 与配置主密钥只在新环境生成一次，保存在部署者的私有密钥管理中；重启时复用，尤其不能重生 `CONFIG_MASTER_KEY`。

::: code-group

```powershell [PowerShell 7]
$env:DB_URL='jdbc:mysql://127.0.0.1:3306/xinghui_admin?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai'
$env:DB_USERNAME='xinghui_app'
$env:DB_PASSWORD='replace_database_password'
$env:REDIS_PORT='6379'
$env:REDIS_DATABASE='0'
$env:REDIS_PASSWORD='replace_redis_password'
$jwtBytes=[byte[]]::new(32)
[Security.Cryptography.RandomNumberGenerator]::Fill($jwtBytes)
$env:JWT_SECRET=[Convert]::ToBase64String($jwtBytes)
$masterBytes=[byte[]]::new(32)
[Security.Cryptography.RandomNumberGenerator]::Fill($masterBytes)
$env:CONFIG_MASTER_KEY=[Convert]::ToBase64String($masterBytes)
mvn -B -ntp clean package
if ($LASTEXITCODE -ne 0) { throw '后端构建失败' }
java -jar system-admin/target/system-admin.jar
```

```bash [Bash]
set -e
export DB_URL='jdbc:mysql://127.0.0.1:3306/xinghui_admin?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai'
export DB_USERNAME='xinghui_app'
export DB_PASSWORD='replace_database_password'
export REDIS_PORT='6379'
export REDIS_DATABASE='0'
export REDIS_PASSWORD='replace_redis_password'
export JWT_SECRET="$(openssl rand -base64 32)"
export CONFIG_MASTER_KEY="$(openssl rand -base64 32)"
mvn -B -ntp clean package
# set -e 保证 Maven 失败时不会运行旧 JAR。
java -jar system-admin/target/system-admin.jar
```

:::

`useSSL=false` 仅用于本机隔离开发示例。生产数据库连接按基础设施要求配置 TLS，见[部署](../operations/deployment.md)。首次成功应看到 Flyway 执行版本迁移和 Spring Boot 启动；默认端口是 `7799`。再次启动应严格校验历史，不重新导入种子。

默认 `tenant.enable=false`、验证码关闭、邮件/OSS/Druid 关闭。未启用存储不会阻止基本登录，但文件功能要先配置；Redis 和 JWT 签名密钥不可省略。RedisTemplate/Redisson 的共同配置及外部配置写法见[配置说明](./configuration.md)。

## 启动前端与文档

另开终端进入 `frontend` 根目录，保持后端终端运行：

```bash
pnpm install --frozen-lockfile
pnpm --filter @vben/web-ele dev
```

应用默认开发地址 `http://localhost:5777`。开发代理将 `/api` 转发到 `http://localhost:7799` 并去掉 `/api` 前缀；改变后端端口时，在启动前设置 `VITE_DEV_API_TARGET`。不要把前端指向外部 mock 后输入真实凭据。

```powershell
$env:VITE_DEV_API_TARGET='http://localhost:7799'
pnpm --filter @vben/web-ele dev
```

完整文档仓库组合提供以下命令；仅检出应用基线、没有 `@xinghui/docs` 包时，需要先取得文档中心配套版本：

```bash
pnpm --filter @xinghui/docs dev
pnpm --filter @xinghui/docs build
pnpm --filter @xinghui/docs preview
```

访问终端报告的文档服务地址下 `/docs/`。生产站点固定从 `apps/docs/.vitepress/dist` 部署。

## 完成与排错

按[首次登录](./first-login.md)立即处理初始化账号，再按[启动验证](./verification.md)核对本人信息、菜单与同源请求。启动缺少变量、Redis 认证失败或 Flyway 校验失败时，先读[故障排查](../operations/troubleshooting.md)，不要关闭迁移校验让应用暂时跑起来。

## 源码依据

后端：`pom.xml`、`system-admin/src/main/resources/application.yml`、`application-datasource.yml`、`db/migration/V1__baseline_schema.sql`、`V2__baseline_data.sql`。前端：`.node-version`、`package.json`、`apps/web-ele/.env.development`、`apps/web-ele/vite.config.mts`。本文命令是部署教程；不会在读者的环境自动执行。
