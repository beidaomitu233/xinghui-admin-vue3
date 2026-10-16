# 环境要求

本页用于开发者和部署者准备兼容工具链、数据库、缓存与存储。开始前应有自己的代码访问权限和隔离环境；业务功能范围见[能力说明](../overview/capabilities.md)。

## 工具链

| 项目 | 当前依据 | 核对命令 |
| --- | --- | --- |
| Java | JDK 17，根 POM 编译 source/target 为 17 | `java -version` |
| Maven | 推荐 3.9.x；使用 Maven 构建全部模块 | `mvn -version` |
| Spring Boot | 根 parent 为 3.3.6 | 查看根 `pom.xml` |
| Node.js | `.node-version` 20.19.6，engines 至少 20.19.0 | `node --version` |
| pnpm | packageManager 固定 10.28.1 | `pnpm --version` |
| 文档引擎 | 文档中心使用稳定 VitePress 1.6.4 | 查看 `apps/docs/package.json` 与锁文件 |

前端 `5.5.9` 是派生工作区包版本，不是本项目正式发布 Tag。不要为修复安装错误直接升级 Vite、Vue 或全量依赖。首次可联网安装，之后以 `pnpm install --frozen-lockfile` 验证清单与锁文件一致；离线安装要求包和元数据已完整缓存。

## 数据服务

MySQL 驱动版本为 8.0.33，Flyway 使用 MySQL 支持模块。当前质量候选在 MySQL 8.0.12 实例上验证了包含最新菜单迁移的空库、重启校验和真实业务冒烟。CI 声明 MySQL 5.7/8.0 容器矩阵，但本轮容器矩阵与独立机器未运行；不能把驱动版本或旧验收记录当成对所有数据库版本的支持承诺。

创建数据库使用 `utf8mb4` / `utf8mb4_general_ci`，并检查 URL 的实例、schema、账号和时区。MySQL 与 Redis 建议只对应用所在内网开放，应用账号不需要其他业务 schema 的权限。

Redis 用于登录态、缓存、验证码、限流以及 Redisson 能力。JWT 签名正确也需要 Redis 中仍有有效登录态；仅启动 MySQL 不够。RedisTemplate 和 Redisson 的连接、数据库编号与认证需要一致，详见[配置说明](./configuration.md#redis-与-redisson)。不要共用其他应用的会话数据库后执行清空命令。

对象存储是可选依赖，默认关闭。验证文件上传/下载需要显式配置已建立的 bucket、服务端可达 endpoint、凭据及对象访问策略。邮件默认关闭；短信、微信和 AI 供应商能力各有配置与外部资格要求，不是空库初始化自动获得的功能。

## 操作系统与浏览器

PowerShell 示例针对 PowerShell 7；Bash 示例需要常见 Unix 工具和 OpenSSL。路径从仓库根开始，不依赖某个 IDE 或个人目录。Windows 可直接运行可执行 JAR，不必安装 Docker 才能本地开发；执行 CI 的容器兼容矩阵则需要可用 Linux 容器环境。

应用面向现代浏览器。开发时先确认 JavaScript、localStorage 和正常同源请求可用；遇到 stale chunk 时按[故障排查](../operations/troubleshooting.md)处理。文档站搜索、字体和静态资源随站点自托管，部署不能只拷贝 Markdown。

## 安装成功的判断

1. `mvn -version` 实际使用 JDK 17，而不是仅系统中安装过它。
2. 数据库管理员能确认专属库；应用账号可以登录该库。
3. Redis 能以配置的密码与 database 编号连接。
4. 冻结安装成功，前端开发端口没有与其他进程冲突。
5. 密钥保存在私有配置中；每次重启均使用同一配置主密钥。

版本不匹配时先修环境，包下载失败时检查当前项目 registry 和网络，不修改全局代理/权限作为默认修复。完整验证步骤见[启动验证](./verification.md)。

## 源码依据

后端根 `pom.xml`、`common/common-redis/pom.xml`、`system-admin/pom.xml`、`system-admin/src/main/resources/application.yml`；前端 `.node-version`、`package.json`、`pnpm-lock.yaml`、`apps/web-ele/package.json`。版本说明与实际验证边界见[版本组合](../releases/versions.md)。
