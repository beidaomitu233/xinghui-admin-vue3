# 配置说明

本页面向部署者和平台管理员。基础设施配置在服务端进程/私有外部 YAML 中提供，平台业务配置通过有权限的管理接口保存。两者职责不同；把密码写进前端 `VITE_*` 变量会进入浏览器，不能作为服务端秘密配置。

## 服务端必需变量

| 变量 | 要求与作用 |
| --- | --- |
| `DB_URL` | 完整 JDBC URL；同时供 Flyway 和 dynamic-datasource 主库使用 |
| `DB_USERNAME` / `DB_PASSWORD` | 当前专属 schema 的应用账号与密码 |
| `REDIS_PORT` / `REDIS_DATABASE` / `REDIS_PASSWORD` | Redis 端口、database 编号与认证，当前 host 默认 127.0.0.1 |
| `JWT_SECRET` | 至少 32 个 UTF-8 字节，无固定回退；缺失或过短会拒绝启动 |
| `CONFIG_MASTER_KEY` | 标准 Base64 编码的 **32 字节** AES 主密钥；加密配置/凭据功能需要正确配置 |

`DB_HOST`、`DB_PORT`、`DB_NAME` 已不是当前配置文件自动拼接 URL 的变量。只设置这三个旧变量无法替代 `DB_URL`。Java 的 JWT 实现直接读取进程环境 `JWT_SECRET`，仅在 YAML 写一个同名属性也不能替代环境变量。

生成密钥只用于新环境：

```bash
export JWT_SECRET="$(openssl rand -base64 32)"
export CONFIG_MASTER_KEY="$(openssl rand -base64 32)"
```

运行前将值存入私有部署配置，后续启动复用。JWT 密钥轮换影响已签发令牌；主密钥改变会使数据库中既有密文无法解密。当前没有自动批量重加密轮换工具，见[备份恢复](../operations/backup-restore.md)。

## 私有外部 YAML

下面可保存为仓库外的 `application-local.yml`，用于替换默认 host、显式限制服务监听、开启租户或验证码。基础密码仍由环境变量提供。

```yaml
server:
  address: 127.0.0.1
  port: 7799
spring:
  data:
    redis:
      host: ${REDIS_HOST:127.0.0.1}
      port: ${REDIS_PORT}
      database: ${REDIS_DATABASE}
      password: ${REDIS_PASSWORD}
tenant:
  enable: false
captcha:
  enabled: true
```

```bash
java -jar system-admin/target/system-admin.jar --spring.config.additional-location=file:./application-local.yml
```

外部文件在命令执行目录解析，文件不存在应作为配置错误处理。该文件不能进入 Git 或公开部署压缩包。需要远程服务监听时按实际反向代理拓扑调整 `server.address`；应用默认未限制为 loopback。

## Redis 与 Redisson

当前项目使用 RedisTemplate 和 Redisson API。Redisson 3.40.2 starter 在没有显式 Redisson config/file 时会从 Spring Redis 属性构造连接；同时存在多个操作 API，不等于默认配置了两台 Redis。项目 `RedissonConfig` 只开启脚本缓存，根 YAML 的 `redisson.singleServerConfig` 不能被当成一份完整独立连接文件。

已有部署若使用显式 Redisson YAML，配置入口是 `spring.redis.redisson.config` 或 `.file`。以下可加入前述外部 YAML 的同一个 `spring` 节点，保证 host/port/database/password 与 `spring.data.redis` 一致：

```yaml
spring:
  redis:
    redisson:
      config: |
        singleServerConfig:
          address: "redis://${REDIS_HOST:127.0.0.1}:${REDIS_PORT}"
          database: ${REDIS_DATABASE}
          password: "${REDIS_PASSWORD}"
          connectionMinimumIdleSize: 2
          connectionPoolSize: 8
        threads: 4
        nettyThreads: 8
```

这是替换显式配置的示例，不要在同一 YAML 重复定义两个 `spring` 根节点。上述引用形式适合无引号/换行的部署密码；复杂凭据需正确 YAML 转义或使用私有配置文件。TLS、集群和 Sentinel 要按实际部署完整配置，不在单机示例上只改一个 endpoint。

连接行为核对依据是 [Redisson 3.40.2 自动配置源码](https://raw.githubusercontent.com/redisson/redisson/redisson-3.40.2/redisson-spring-boot-starter/src/main/java/org/redisson/spring/starter/RedissonAutoConfiguration.java)及[属性前缀](https://raw.githubusercontent.com/redisson/redisson/redisson-3.40.2/redisson-spring-boot-starter/src/main/java/org/redisson/spring/starter/RedissonProperties.java)。发生一边成功一边 `NOAUTH` 时，检查是否存在覆盖的 config/file，不能关闭 Redis 认证绕过。

## 默认关闭与可选功能

| 功能 | 当前默认 | 启用条件 |
| --- | --- | --- |
| Flyway | 启用；baseline 默认 false，clean 禁止 | 已建立数据库；存量库先评估历史 |
| 租户 | `tenant.enable=false` | 启用前核对租户、存量数据与跨租户约束 |
| 邮件 | `MAIL_ENABLED=false` | 显式 SMTP host/user/pass/from，启用时启动校验 |
| MinIO 配置 | `OSS_ENABLED=false` | 完整设置 access/secret/endpoint/bucket，或平台业务配置接管 |
| Druid 监控 | `DRUID_ENABLED=false` | 另有安全边界；Security 默认拒绝 `/druid/**`，设置 enabled 不会自动开放访问 |
| 验证码 | `captcha.enabled=false` | 私有 YAML 开启；登录同时提供 code/uuid |

MinIO 环境键是 `OSS_ACCESS_KEY`、`OSS_SECRET_KEY`、`OSS_ENDPOINT`、`OSS_BUCKET`、`OSS_PREFIX`；不要只改 `default-platform` 就声称存储已可用。平台业务配置接口为 `/system/businessConfig/{section}`，section 仅 `wechat`、`sms`、`oss`；前端页面路由 `/system/business-config` 不是 API 地址。数据库配置优先及脱敏状态见[业务配置](../features/business-config.md)。

租户开关默认关闭 MyBatis 租户拦截，但本人通知、文件归属和低代码有各自服务端约束；不能因此声称全局不验权或所有 API 统一隔离。详细边界见[租户与平台](../development/tenant-platform.md)。

## 前端与文档

开发/生产 API 默认 `/api`，开发代理通过 `VITE_DEV_API_TARGET` 设置后端。生产通过反向代理去掉 `/api` 前缀。`VITE_APP_STORE_SECURE_KEY` 只用于前端持久化存储处理，不是 JWT 签名或服务器密钥；它会进入产物。

文档中心生产基路径 `/docs/`，静态产物 `apps/docs/.vitepress/dist`。不要用 `.env.production.local` 私有覆盖文件运行 `scripts/build-quality.mjs`：该门槛会拒绝覆盖已有个人 runtime 文件，保障同源验收。更多拓扑与 Nginx 示例见[部署](../operations/deployment.md)。

## 结果、失败与源码

成功配置后，应用能迁移/校验当前 schema、读取 Redis 登录态，平台配置页面显示密钥已配置状态而非明文。缺少 JWT 是启动错误；缺少/损坏主密钥可能允许基础功能启动，但加密配置功能必须报告未就绪，不能写“所有密钥已可用”。

本地源码：后端 `system-admin/src/main/resources/application.yml`、`application-datasource.yml`、`common/common-core/src/main/java/com/xinghuiTec/constants/JwtConstants.java`、`config/SecretCipher.java`、`common/common-redis/src/main/java/com/xinghuiTec/config/RedissonConfig.java`、`system-framework/src/main/java/com/xinghuiTec/config/JwtSigningKeyConfiguration.java`；前端 `apps/web-ele/vite.config.mts`、`.env.production`、`scripts/build-quality.mjs`。
