# 故障排查

本页向开发者和运维人员提供从现象到证据的排查路径。准备当前提交、配置版本、接口路径和短错误摘要；日志只在受控环境查看，不复制JWT、手机号、密钥、SQL全文或AI prompt到公开工单。

## 应用不能启动

| 现象 | 首先核对 | 恢复动作 |
| --- | --- | --- |
| `Could not resolve placeholder DB_URL` | 进程实际环境，不是旧DB_HOST/DB_NAME变量 | 设置完整URL和账号，重启该应用 |
| `JWT_SECRET is required` / 至少32字节 | 进程环境JWT_SECRET | 提供安全且稳定密钥；不能设置默认口令 |
| DB认证/Unknown database/连接超时 | URL的实例/schema/账号、网络/TLS、schema是否存在 | 修正自有部署配置，不在未知库试初始化 |
| Flyway validate/checksum/missing失败 | history、代码脚本和locations | 停止反复启动，按[迁移](../reference/database-migrations.md)制定修复 |
| 邮件启用后配置缺失 | MAIL_ENABLED和SMTP必需字段 | 完成私有配置，或保持关闭 |

当前默认baseline false且clean禁止。将其改true、删history、关闭校验不是启动故障的通用解法。成功启动也不代表对象存储或供应商能力已配置。

## Redis与会话

JWT解析有效但Redis登录态读取失败，过滤器返回HTTP503；登录态不存在/过期则HTTP401/code311。503不能统一解释为密码错或令牌过期，也不应触发所有在线用户反复注销。

检查RedisTemplate与Redisson是否使用相同host/port/database/password，是否存在 `spring.redis.redisson.config/file` 的覆盖。旧独立Redisson文件可能仍指向另一个实例。不要通过关闭Redis认证或清空共享database修复自己的连接。

权限修改后由服务处理相关用户信息/路由缓存；客户端恢复会话时用服务器当前permissions覆盖本地持久化值。直接改SQL但未走缓存失效路径时可能显示旧菜单，应先核对服务流程，不能清空所有应用的键。

## 页面、代理与静态产物

| 现象 | 排查/恢复 |
| --- | --- |
| 登录请求到外部mock | 查看Network URL及生产`_app.config.js`，恢复同源/api后再登录 |
| 后端收到`/api/user/login`而404 | 开发rewrite或Nginx proxy_pass末尾斜杠缺失；后端路径应为/user/login |
| 文档深页刷新回到应用首页 | `/docs/`缺少独立静态规则；不要用应用SPA fallback处理文档路径 |
| `Failed to fetch dynamically imported module` | 核对当前HTML与哈希资源是否配套，保留旧资源过渡、刷新文档重试 |
| 缺页跳转后仍显示上一个页面 | 当前实现应在新URL显示缺页/重试；检查是否部署旧路由产物 |
| 分页总数不对/ID变形 | 计数Long字符串只在分页适配转数字，ID必须保持字符串 |

文档搜索空结果先确认完整索引随文档dist部署、/docs/基路径与资源响应正确；B部分正文没有索引，不能宣称搜索功能已验证。

## 业务资源与配置

- **403/309**：按接口检查操作码、平台身份和资源范围。本人信息、收件箱不需要管理操作码，不代表配置/表单管理免权限。
- **文件404/403/502**：先核对文件记录、创建者/租户和历史存储配置，再核对远端对象；管理员操作码不是读取所有文件的通行证。未启用OSS时不要盲目重复上传。
- **业务配置409**：revision已改变，保留输入，重新读取并比较；不要自动反复覆盖。
- **低代码“内容已被修改”**：当前为业务失败而非保证HTTP409。重读记录revision；表单发布后新填写使用新schemaVersion，已有记录仍对应其历史schema。
- **配置加密未就绪/解密失败**：核对Base64的32字节主密钥及是否误更换；恢复原密钥，不能把页面脱敏状态当成明文凭据可读。

## 供应商与扩展边界

微信未配置或无资质时capability应关闭入口；已交付的是授权发起/state链路，完整绑定登录未交付。不要降低callback/state校验继续扫码。短信发送需要私有供应商、模板、签名和独立授权，不作为日常排错默认动作。

模型测试首先看本地 `outcome` 和上游 `httpStatus`，HTTP429表示上游限流，不是本地接口路由缺失。历史成功也不能替代当前凭据、余额和模型可用性。业务场景读取只渲染已发布prompt；APP_NOT_REGISTERED需开发者注册converter/resolver，不通过传tenantId或任意SQL解决。

## 提交可复现问题

提供代码/产物版本、工具链、脱敏配置项名、请求方法/路径、HTTP与业务code、最小复现步骤及预期/实际结果。保留私有原始证据，只公开必要短摘要。不要把任务板、QA日志、认证状态或本机绝对路径发布到文档。

源码：`system-framework/src/main/java/com/xinghuiTec/filter/LoginFilter.java`、`AuthenticationEntryPointImpl.java`；后端`application.yml`、`SecretCipher`、各Controller局部错误处理；前端`apps/web-ele/src/api/request.ts`、`src/router/routes-helper.ts`、`src/api/core/session-info.ts`、`src/views/system/notification/target-navigation.ts`。接口错误详见[错误码](../reference/error-codes.md)。
