# 运行配置

## 必需配置

| 变量 | 作用 |
| --- | --- |
| `DB_URL` | MySQL JDBC URL，供应用和 Flyway 共用 |
| `DB_USERNAME` / `DB_PASSWORD` | 数据库账号与密码 |
| `REDIS_PORT` / `REDIS_DATABASE` / `REDIS_PASSWORD` | Redis 连接配置 |
| `JWT_SECRET` | JWT 签名密钥，至少32字节 |
| `CONFIG_MASTER_KEY` | Base64 编码的32字节 AES 主密钥，用于加密凭据 |

在新环境生成密钥并保存到私有环境配置，后续启动复用：

```bash
openssl rand -base64 32
```

数据库配置中保存的密文依赖原有主密钥，备份时应一起保管。

## 可选配置

| 配置                  | 用途                  |
| --------------------- | --------------------- |
| `tenant.enable`       | 开启租户              |
| `captcha.enabled`     | 登录验证码            |
| `MAIL_ENABLED`        | 环境邮件配置          |
| `OSS_ENABLED`         | 环境对象存储配置      |
| `DRUID_ENABLED`       | Druid 监控            |
| `VITE_DEV_API_TARGET` | 前端开发 API 代理目标 |

微信、短信、邮件、对象存储和 AI 供应商也可在后台页面配置。服务端密钥不放入 `VITE_*` 变量。

## 外部配置文件

```yaml
server:
  address: 127.0.0.1
  port: 7799
spring:
  data:
    redis:
      host: 127.0.0.1
      port: ${REDIS_PORT}
      database: ${REDIS_DATABASE}
      password: ${REDIS_PASSWORD}
tenant:
  enable: false
captcha:
  enabled: false
```

```bash
java -jar system-admin/target/system-admin.jar --spring.config.additional-location=file:./application-local.yml
```

Agent 原生共享状态通过 Redis 保存，应用配置与会话记录保存在 MySQL。部署见 [自动部署](../operations/deployment.md)。
