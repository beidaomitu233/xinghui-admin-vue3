# API 调用约定

本页面向前端、脚本和业务集成开发者。前提是已完成本环境登录，并具备目标接口操作码和必要平台身份。本文描述实际传输约定，不提供新的 SDK，也不把接口清单当成运行中的 OpenAPI 服务。

## 地址与请求头

Controller 的实际路径不含 `/api`；浏览器/同源反向代理增加 `/api`，转发时删除它。例如前端 `/api/system/businessConfig/oss` 对应后端 `/system/businessConfig/oss`，不是页面路由 `/system/business-config`。

当前认证过滤器直接验证 `Authorization` 的整个值，因此发送 **原始 JWT**，不加 `Bearer `。前端 `request.ts` 同时发送 `Accept-Language`。已有代理若重写/丢弃 Authorization，要在代理层修复，而不是用 URL 查询参数传 token。

```http
GET /api/system/user/list?pageNum=1&pageSize=10
Authorization: <JWT>
Accept-Language: zh-CN
```

JSON 写接口使用 `Content-Type: application/json`，文件接口使用 multipart 或二进制，按接口目录区分。注销为 `POST /user/logout`；当前管理应用没有已启用的 refresh-token 流程，不能拿上游 mock 的刷新接口作为后端契约。

## HTTP 与业务结果

普通 JSON 返回：

```json
{
  "code": 200,
  "message": "成功",
  "data": {
    "records": [{ "userId": "9223372036854775000", "nickname": "示例用户" }],
    "total": "1",
    "size": "10",
    "current": "1"
  }
}
```

这是 `Page` 序列化形状示意，不表示 ID 对应本环境真实账号。前端 `requestClient` 以 `code===200` 判成功并解包 `data`。`Result.ok()` 可以 `data=null`；不能假设所有成功接口都有对象。

部分旧错误通过 HTTP 200 返回业务失败，权限异常经全局处理可能为 `code=309`；部分新 Controller 用 `ResponseEntity` 同时设置 4xx/5xx。HTTP 401 的登录态错误为 `code=311`，不是所有 HTTP 状态与业务 code 相等。下载/导出成功返回二进制，不能先按 JSON 解析。完整区分见[错误码](./error-codes.md)。

## ID、分页和时间

后端 Jackson 将 `long` / `Long` 序列化为十进制字符串，避免 Snowflake ID 超过 JavaScript `Number.MAX_SAFE_INTEGER`。所有资源 ID 在浏览器中保留字符串；不使用 `Number(id)`、浮点或科学计数法构造路径。当前 URL 中的 ID 根据后端 DTO 转为 long，传入有效十进制串即可。

`total`、MyBatis Page 的 `current` / `size` 等 Long 也可能是字符串。供分页控件使用的计数可以在适配层转数字，但必须与 ID 分开处理。资讯、低代码使用自定义 `{records,total,pageNum,pageSize}`，本人通知是 `{items,total,pageNum,pageSize}`；其他列表可能直接返回 MyBatis Page，不能假设全站同一分页 DTO。

用户/操作日志查询 DTO 的 `pageNum>=1`、`pageSize` 为 1–100；低代码限制页码最多 1,000,000、pageSize 1–100；本人通知 pageSize 1–100。文件等旧 Controller 没有相同显式上限，不能宣称全局自动钳制。排序字段按各 DTO/服务允许项验证，不透传任意 SQL 字段。

`BaseEntity` 和公告日期字段有 `yyyy-MM-dd HH:mm:ss` / GMT+8 序列化注解；低代码 SQL 时间、自定义字符串和其他 LocalDateTime 字段按各自实现返回，不是全局 ISO UTC 契约。读日期先确认字段格式/业务时区，不盲目追加 `Z`。查询条件的日期格式从对应 DTO 获取。

## 版本与并发编辑

平台业务配置使用整数 `revision`：读取当前配置、保留版本，再提交一次；过期 revision 返回 HTTP 409，保留用户输入、重新读取并比较，不能无脑循环重试。

```json
{
  "enabled": false,
  "parameters": {
    "provider": "minio",
    "endpoint": "https://storage.example.com",
    "bucket": "your-bucket",
    "basePath": "uploads/"
  },
  "secrets": {},
  "clearSecrets": [],
  "revision": 0
}
```

这是 **尚未有存储配置、保持禁用** 的示意，revision 必须替换为本次读取值。新建或启用时按实际凭据提供 secrets；留空 secrets 是保留已存密钥，不是删除，显式清除用 `clearSecrets`。读取返回 `secretsConfigured` 布尔状态，不返回密钥。

低代码也带整数 `revision` / `schemaVersion`，但其服务冲突目前通过 `ServiceException` 走业务失败，**不是保证 HTTP 409**。记录编辑的版本属于记录，表单发布版本属于 schema；二者不能混用。遇到“内容已被修改”应保留输入、重读比较后提交。详情约束见[低代码](../features/lowcode.md)。

## 上传与下载

`POST /system/oss/upload` 字段名是 `file`，需要 `system:oss:upload`。Controller 校验非空、最大 **20 MiB**，扩展名集合为 `jpg/jpeg/png/gif/webp/pdf/txt/csv/doc/docx/xls/xlsx/ppt/pptx/zip`。Servlet 上限 100MB 并不放宽这一业务限制。扩展名校验不是病毒扫描或文件内容鉴定。

```bash
curl --fail-with-body -H "Authorization: ${TOKEN}" \
  -F 'file=@./example.txt' \
  'https://admin.example.com/api/system/oss/upload'
```

下载需要 `system:oss:download` 且文件属于当前创建者；开启租户后还校验当前租户。列表和详情也按创建者归属；即使是管理员也不能仅凭操作码下载别人的文件。先验权再流式写响应，失败可能为 HTTP 404/403/502；不要在已提交的文件流末尾拼 JSON。

用户导入是另一条 `/system/user/import`：multipart **part** `file`，不与 OSS 上传混用；支持与模板一致的 XLSX，文件/请求/行数有独立限制，见[批量操作](../features/bulk.md)。不要把它写成通用 CSV 导入。

## 本人通知与 AI 场景边界

本人通知 `/notifications` 使用认证主体的 owner/tenant，客户端不能指定别人的 userId。批量标已读 `{"ids":["有效ID"]}` 最多 100 个正整数 ID；恶意越权或缺失项在更新前整批校验。未读数是 Long 字符串，前端需计数适配。

业务场景读取 `POST /ai/scenes/{appKey}/{sceneKey}/render` 接收 `{ "context": { ... } }`。context 字段由对应业务转换器/变量解析器注册，不能传 `userId`、`tenantId`、`authorities`、SQL、URL 或任意变量表达式。没有注册对应业务 app 时接口返回未注册，而不是执行任意动态表达式。

此读取只产生已发布场景的 prompt 与 `publishedRevision/modelId`，不调用模型供应商。请求仅接受 JSON 和 identity Content-Encoding，最大 16,384 字节，响应 no-store，带 `X-Request-ID`，错误返回可分类的 `AI_SCENE_READ:*`；不能记录输入值或生成 prompt 到普通访问日志。场景扩展见[AI 扩展](../development/ai-extension.md)。

## 正常结果与恢复

在自己有权限的资源上，应得到 HTTP 成功且业务 code 200；越权不通过增加前端按钮或伪造 tenantId 解决。解析失败、版本冲突或存储不可用时，先保存输入并按[错误码](./error-codes.md)与[故障排查](../operations/troubleshooting.md)定位层次。

## 场景工作区与监控

新场景使用服务端生成的sceneKey和不可变sceneVersionId，合法配置携带expectedRevision/clientMutationId直接保存；无需发布应用。管理、业务运行、scene-data及监控的完整路径和逐项权限见[API目录](./api-catalog.md#场景工作区与直接保存接口)，不要把上面的旧appKey/sceneKey渲染链路当成新工作区接口。

场景新增/保存/启停JSON上限128KiB；业务提交、模型试运行及预览上限32KiB，仅接受application/json和identity编码。预览/试运行同时要求平台身份、ai:scene:test与ai:scene:invoke，业务数据仍按当前真实主体授权。候选模型、Key与数据对象的查询权限分别检查，管理动作不授予业务读取权。

监控导航可从真实日志或配置动作派生，入口可见不授予日志list、配置query或AUDIT。缺少相应统计权限时字段为null并附安全原因，不能解释为0。新接口响应禁缓存，预览及数据候选包含private；查询监控不会重发供应商请求。

## 对话与实际数据预览增量

新对话用户/助手正文持久化，刷新后按本人或明确审计范围查询；不以浏览器localStorage或短期SSE缓存代替数据库历史。旧无正文请求仍明确提示未保留。新对话/续聊使用clientMutationId，重复提交复用原结果，同会话已有在途时明确冲突，不并发拼接回答。

数据库引用与实际值预览见[实用改造API](./api-catalog.md#数据库引用与实际值预览)。POST records/preview接受128KiB以内JSON及identity编码；普通授权值保持实际结构，秘密在读取投影中排除。通用database.record业务引用为C行候选生成的有界类型化引用，不能用旧短ID格式校验或截断；它仍不构成数据授权。

## 源码依据

后端 `common/common-core/src/main/java/com/xinghuiTec/utils/Result.java`、`system-framework/src/main/java/com/xinghuiTec/config/JacksonConfig.java`、`filter/LoginFilter.java`；`system-admin/src/main/java/com/xinghuiTec/` 下的 `controller/SysOssController.java`、`NotificationInboxController.java`、`BusinessConfigController.java`、`ai/prompt/AiSceneReadBoundaryFilter.java`、`AiSceneReadService.java`、`lowcode/LowcodeService.java`。前端 `apps/web-ele/src/api/request.ts`、`src/api/system/dict.ts`、`src/views/system/notification/target-navigation.ts`。
