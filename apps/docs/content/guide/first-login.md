# 首次登录与初始化账号

本页用于部署者在私有新环境完成初始化、密码替换和权限核对。必须先完成[快速开始](./quickstart.md)，确认是自己的空库，且尚未向公网开放应用。

## 使用手机号登录

登录 DTO 使用 `phone`、`password`，不是 `username`。`V2__baseline_data.sql` 公开种子定义：管理员手机号 `13800000000`，演示手机号 `13800000001`，初始化密码均为 `admin123`。它们是仓库公开的种子数据，不是某个真实环境的管理员凭据，不能在正式部署继续使用。

1. 仅在本机或受控内网访问新环境。
2. 使用初始化管理员登录，查看本人信息和菜单。
3. 在个人资料中立即修改密码；新密码 6–20 字符且同时包含数字和字母。
4. 密码修改成功后重新登录，确认旧密码不再可用。
5. 修改管理员手机号/联系资料；处理演示账号，按实际用途停用或移除。
6. 创建各职责的独立账号和角色，验证最小权限后再开放访问。

管理端菜单为“系统管理、通用能力、运行维护”。普通登录账号应保留自己的收件箱入口，但不因出现目录而获得其他管理操作码。不要把前端目录可见当成后端授权证明。

## 验证码与令牌

默认验证码关闭，`GET /captcha` 返回 `enabled=false`；启用后响应 `uuid`、`img`，登录请求追加 `code`、`uuid`。错码或过期应刷新图片并重新输入，不能复用旧 uuid 无限尝试。

```json
{
  "phone": "13800000000",
  "password": "replace_with_current_password",
  "code": "仅在启用验证码时填写",
  "uuid": "当前验证码响应中的值"
}
```

关闭验证码时直接省略 `code` 和 `uuid`。`POST /user/login` 成功返回 `data` 中的原始 JWT 字符串，浏览器适配为 `accessToken`；调用受保护接口时头部是 `Authorization: <JWT>`，当前实现不添加 `Bearer ` 前缀。

登录接口有按 IP 维度的限流，60 秒最多 5 次；密码错误次数/锁定由服务实现处理。不要通过反复点登录排查代理问题。重新认证和缓存故障区分见[错误码](../reference/error-codes.md)。

## 修改本人密码

本人接口由服务端获取当前用户 ID，客户端不用传 userId：

```http
PUT /api/system/profile/updatePwd
Authorization: <JWT>
Content-Type: application/json
```

```json
{
  "oldPassword": "replace_with_current_password",
  "newPassword": "replace_with_new_password",
  "confirmPassword": "replace_with_new_password"
}
```

示例字符串需要替换为满足校验的真实私有值，不能照抄作为生产密码。新旧密码不能相同，确认值必须一致；服务端 BCrypt 存储，成功后清理当前用户登录相关缓存，前端需要重新认证。管理员“重置密码”是另外的授权接口，不是本人改密，也不要把其临时密码写入日志。

## 常见失败与恢复

| 现象 | 核对与恢复 |
| --- | --- |
| 页面可打开，登录请求发到外部 mock | 检查 Network 的 origin、`/api` 代理和 `_app.config.js`；修正地址后再输入账号 |
| 账号不存在/停用 | 确认连接到自己的新库及种子迁移成功；已有库按实际账号登录，不能重复导入 V2 |
| 登录后 HTTP 401 | 核对原始 Authorization 格式、JWT 密钥和 Redis 登录态，不人工伪造 token |
| 本人信息能读，管理页面 403 | 核对该账号权限/平台身份；本人接口不需要管理操作码，不意味着管理接口也免授权 |
| 改密后被要求重新登录 | 正常行为；以新密码登录，避免自动恢复旧本地权限 |

更多操作见[账号管理](../features/accounts.md)与[权限](../features/authorization.md)。

## 源码依据

后端 `system-admin/src/main/resources/db/migration/V2__baseline_data.sql`、`controller/LoginController.java`、`domain/dto/LoginDTO.java`、`controller/SysProfileController.java`、`domain/dto/SysPasswordUpdateDTO.java`、`service/impl/SysUserServiceImpl.java`；路径均在 `system-admin/src/main/java/com/xinghuiTec/` 下。令牌头见 `system-framework/src/main/java/com/xinghuiTec/filter/LoginFilter.java`；前端见 `apps/web-ele/src/api/core/auth.ts`、`src/api/request.ts` 和 `src/store/auth-session.test.ts`。
