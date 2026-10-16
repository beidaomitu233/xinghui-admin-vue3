# 错误码与失败恢复

本页面向 API 调用者和故障处理人员。判断失败需要同时读取 HTTP status、JSON 的 `code/message` 和发生的接口，不能把一个枚举值套用到所有业务。没有 JSON 的网络/代理错误仍须单独处理。

## 通用业务码

`ResultCodeEnum` 定义以下主要分组；实际 Controller 还可能返回自定义数值或默认 201。

| code | 含义 | 客户端处理 |
| --- | --- | --- |
| 200 | 成功 | 解包 data；无返回值时 data 可为 null |
| 201–207 | 失败、参数、服务、数据、非法请求、重复提交、仍有子集 | 显示服务端短提示；保留输入，不假设等同 HTTP 4xx |
| 301–304 | 账号/验证码相关枚举 | 核对具体接口实际返回，验证码错误也可能返回默认 201 |
| 305 / 311 | 未登录、未登录或过期 | 以当前 HTTP 401 和登录态判定，重新认证 |
| 306–310 | 账号不存在/错误/禁用、无权限、用户不存在 | 不反复重试；错误密码实现常用 307，权限常用 309 |
| 501–507 | 预留应用登录/短信枚举 | 仅按已实现接口解释；枚举存在不代表移动应用登录已完整交付 |
| 601 / 602 | token 过期/非法枚举 | 当前管理过滤器通常统一返回 HTTP 401/code311，不强依赖这两个枚举 |

全局 `GlobalExceptionHandler` 的参数校验和很多 `ServiceException` 使用 `Result.fail(message)`，因此可能 HTTP 200/code201。数据库唯一冲突返回“数据已存在，请勿重复提交”，其他数据库错误返回受控短提示，不向用户展示 SQL。

## HTTP 与业务码的实际组合

| 入口/失败 | HTTP | 业务 code / 内容 | 恢复 |
| --- | --- | --- | --- |
| 未登录/失效 JWT 或登录态不存在 | 401 | 311 | 重新登录；不追加 Bearer 前缀 |
| 读取 Redis 登录态基础设施异常 | 503 | 503 | 保持输入，等待服务恢复；不自动认作密码错误 |
| 老管理接口的 `AccessDeniedException` | 可能 200 | 309 | 检查操作码与平台身份 |
| 本人通知 Controller 拒绝 | 403 | 309 | 不重试其他 owner ID |
| 低代码 Controller 拒绝 | 403 | 309 | 检查操作码与资源范围 |
| 低代码缺参/格式错误 | 400 | 400 | 修正字段类型或 revision |
| 低代码版本过期/资源业务失败 | 通常 200 | 201 + 短提示 | 重读并比较，保留用户输入 |
| 文件缺失 / 越权 / 未提交响应的下载故障 | 404 / 403 / 502 | 201 / 403 / 201 | 核对文件归属和存储状态 |
| 业务配置校验 / 权限 / revision 冲突 | 400 / 403 / 409 | 通常同 status | 修正字段、权限或重读配置 |

例如未认证的响应：

```json
{ "code": 311, "message": "用户未登录或登录已过期", "data": null }
```

前端默认响应拦截器会将非成功 code 转成失败；不要只看 Axios 的 HTTP fulfilled 分支。用户提示应简短，详细诊断在受控日志中完成，不向页面显示凭据、SQL 或 provider 请求全文。

## AI 场景读取

`/ai/scenes/{appKey}/{sceneKey}/render` 的错误消息采用 `AI_SCENE_READ:<原因>`，可携带响应头 `X-Request-ID` 向运维关联审计事件。

| 类别 | HTTP / code | 例子 | 恢复 |
| --- | --- | --- | --- |
| 未认证/身份无效 | 401 / 311 | `UNAUTHENTICATED` | 重建有效会话 |
| 权限/租户/资源越权 | 403 / 309 | `BUSINESS_PERMISSION_REQUIRED`、`TENANT_MISMATCH` | 申请正确业务授权，不在 context 伪造主体 |
| app/资源不存在 | 404 / 204 | `APP_NOT_REGISTERED`、`RESOURCE_NOT_FOUND` | 核对业务注册与场景键 |
| context/JSON 无效 | 400 / 202 | `CONTEXT_INVALID`、`INVALID_REQUEST` | 按业务允许字段重新构造 |
| 场景/变量注册不可用 | 409 / 201 | `SCENE_UNAVAILABLE`、`VARIABLE_NOT_REGISTERED` | 由场景管理员核对发布和变量注册 |
| 值缺失/未声明/无效/输出过长 | 422 / 202 | `MISSING_VARIABLE`、`UNDECLARED_VALUE`、`OUTPUT_TOO_LONG` | 修正上下文或模板 |
| 过大/不支持媒体类型 | 413 / 202；415 / 202 | `REQUEST_TOO_LARGE`、`UNSUPPORTED_CONTENT` | 使用未压缩 JSON，限制在16KiB内 |
| 内部失败 | 503 / 203 | `INTERNAL_FAILURE` | 保留 traceId，运维排查，不泄露 prompt |

这不是供应商模型 HTTP 状态。管理员模型测试的本地响应中可以包含上游 `httpStatus=429` 或其他失败结果；本地 Controller 返回成功包装不等于模型推理成功。历史 NVIDIA 成功、Poolside 上游429仅是当时验证，不能保证读者的模型账户现时可用。

## 微信与批量限制

微信 capability 可以返回未配置或不具备授权能力；authorize/callback 使用 `WechatFailure` 的实际状态，不能用关闭校验绕过 state/cookie/callbackUri 绑定。当前仅授权发起/state 流程交付，完整绑定登录尚未交付，外部无 AppID 的环境无法进行真实扫码验收。

用户导入有请求大小/Content-Length 前置限制、XLSX/行数和数据校验。文件导入失败时不把部分失败报告当成全部成功；按[批量操作](../features/bulk.md)显示成功/失败摘要，勿无限重试同一文件。

## 排查步骤与源码

先记录接口、HTTP status、业务 code、短 message 和可用 traceId；核对一次当前提交与配置，再按[故障排查](../operations/troubleshooting.md)处理。遇到资源/版本冲突先重读，遇到 503 排基础设施，遇到 401 才重认证。本文不会提供错误码“吞掉后继续成功”的兜底。

源码：`common/common-core/src/main/java/com/xinghuiTec/emues/ResultCodeEnum.java`、`exception/GlobalExceptionHandler.java`；`system-framework/src/main/java/com/xinghuiTec/filter/{AuthenticationEntryPointImpl,LoginFilter}.java`；`system-admin/src/main/java/com/xinghuiTec/controller/{SysOssController,NotificationInboxController,BusinessConfigController,AiSceneReadController}.java`、`lowcode/{LowcodeFormController,LowcodeRecordController,LowcodeService}.java`、`ai/prompt/AiSceneReadBoundaryFilter.java`、`config/UserImportUploadLimitFilter.java`。
