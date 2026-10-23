# API 目录

## 2026-10-23：业务配置与微信登录增量

本节记录本轮变化；下方按旧配对保存的接口快照不代表所有当前接口。表中是后端路径，实际同源客户端需加`/api`前缀。

| 方法 | 后端路径 | 身份与行为 |
| --- | --- | --- |
| GET/PUT | `/system/businessConfig/{section}` | 沿用平台查询/编辑权限；section新增`wechatMp`和`mail`，与原有wechat/sms/oss独立revision |
| GET | `/auth/wechat/login-capability` | 匿名读取网站/H5入口可用性，不返回密钥 |
| POST | `/auth/wechat/flow` | 匿名发起，校验场景、Origin、站内returnPath，设置HttpOnly浏览器绑定cookie；返回流程标识与固定微信授权地址 |
| GET | `/auth/wechat/flow/status` | 流程标识与发起浏览器共同限定，不以此授予产品身份 |
| POST | `/auth/wechat/flow/cancel` | 同浏览器与Origin校验后取消 |
| POST | `/auth/wechat/flow/complete` | 微信身份已确认且已有绑定时，一次性检查产品账号并建立会话 |
| POST | `/auth/wechat/flow/bind` | 必须先登录已有产品账号，显式关联当前流程，不接受客户端自报user/tenant |
| GET | `/auth/wechat/callback` | 网站应用回调；校验一次性state后交换身份，再303到固定站内结果页 |
| GET | `/auth/wechat/mp-callback` | 微信内H5回调；使用服务号独立AppID、scope与密钥 |

`flow`写请求体为`{channel,returnPath}`，后续写请求为`{flow}`。微信流程表与绑定摘要见V310；回调code仅用于服务端一次性交换，不持久化或写入日志。产品会话token由完成接口返回，不塞入结果页URL。供应商真实验证边界见[业务配置](/features/business-config)。

本页供集成开发者按路径定位 Controller、调用权限和请求 DTO。保留的旧目录对应 v1.2.0 静态旧快照的教程基线：32 个 Controller，其中30个有HTTP映射，共147条方法/路径（含资讯列表别名）。工作区改造前的一期[源码配对](../releases/versions.md)另新增6个AI Controller、59条映射，形成38个Controller、36个有映射、206条方法/路径的历史盘点，逐条见[旧版一期兼容接口](#当前源码一期新增-ai-接口)。本次新增的4个工作区Controller及20条映射另列在[场景工作区接口](#场景工作区与直接保存接口)，不把206当作改造后的总数。

对话、设置与数据库引用见[实用改造接口](#实用改造接口)。本轮配置、数据预览、引用保存和对话阅读已原生验证；真实供应商限制见[版本组合](../releases/versions.md)，历史接口数量不作为新增能力通过证明。

旧目录的签名与行号仍属于旧基线；旧版一期兼容节的行号属于后端 `79b4655b56621fbcdafe48eb858d312bd76eb465`。v1.2.0静态站不运行后端，当前源码AI一期未打独立发行Tag；本页不是运行时Swagger，也不承诺未配置服务的接口可直接成功。Agent/插件草案接口未收录为实现。

## AI请求详细日志

当前实现位于`AiCallLogController`及`AiCallLogService`，与对话消息接口并存。每行是一条真实上游交互，重试分别记行；刷新和查询不会调用模型。

| 方法 | 路径 | 操作权限 | 返回data |
| --- | --- | --- | --- |
| GET | `/system/ai/call-logs` | `ai:request:list` | `{records,total,pageNum,pageSize}` |
| GET | `/system/ai/call-logs/statistics` | `ai:request:list` | 交互数、成功/失败数、已知Token及未知次数 |
| GET | `/system/ai/call-logs/{callId}` | `ai:request:query` | `{call,response}` |
| GET | `/system/ai/call-logs/export` | `ai:request:export` | 最多5000条结构化记录，不含响应正文 |

共同筛选为`scope`、`from`、`to`、`requestId`、`modelRef`、`providerCode`、`status`、`entryType`、`tenantRef`、`subjectRef`、`appId`、`sceneKey`。时间使用ISO Instant，范围`[from,to)`，默认最近7天、最大31天；列表默认第1页、每页20条，最大100条。`entryType`为`REQUEST_ATTEMPT`、`CONFIGURATION_TEST`或`MODEL_DISCOVERY`；不要把目录扫描算成模型生成。

`scope`默认OWN，不能通过tenantRef/subjectRef冒充他人；AUDIT须真实平台身份及`ai:request:audit`。目录/连接测试还受平台配置查看范围限制。详情重新核查当前资源权限，SQL助手和模型测试等私有正文不因审计权限开放；无正文权限时`response=null`、`responseAvailable=false`。接口返回`Cache-Control: no-store`，客户端不得持久缓存这些内容。

记录包含关联请求/尝试或测试/搭配、渠道与上游模型、状态/错误、各阶段时间、input/output/total/cache/reasoning Token、reportedCost及currency、finishReason和安全归档标记。Long及费用按精确字符串读取；未提供、未知和不可测保持null，不能填0。首输出为首个非空模型内容，首字节与首文本分别计时，非流式首输出不可测。

`response`非空时包含`format`、`body`、`headers`、`usage`、`receivedBytes`、`archivedBytes`，body也可为null。JSON/SSE按接收顺序有界脱敏归档，保留供应商未知扩展；归档上限256KiB，截断、部分和采集失败显式标记，密钥与敏感头不返回。客户端仅以文本展示，不执行响应HTML或脚本。统计的knownInputTokens/knownOutputTokens与unknownInputCalls/unknownOutputCalls分开；相同筛选在列表、统计及导出中保持一致。

## 调用前提

表中路径为后端路径，同源部署访问时加 `/api`。先用 `/user/login` 登录，再发送原始 JWT `Authorization`；默认不支持 Bearer 或刷新 token。除登录/验证码和微信公开边界外，Security要求已认证。标注平台身份的接口还需要实际操作码；没有方法注解的接口仍可能在类/服务中验权。权限表达式保留源码，不把目录可见当成接口许可。

请求 JSON、ID字符串、分页和错误约定见[API调用约定](./api-conventions.md)与[错误码](./error-codes.md)。下方签名摘要用于找到真实 DTO/参数绑定，不是可直接复制编译的 SDK 函数。

## 常用请求与返回字段

| 入口 | 请求字段/绑定 | 成功 data |
| --- | --- | --- |
| 登录 | JSON `phone/password`，启用验证码时 `code/uuid` | 原始JWT字符串 |
| 本人信息 | 无 userId 查询参数 | `user`、`roles`、`permissions` |
| 本人资料修改 | JSON `nickname/email/mobile`；服务端选择本人 | null |
| 本人改密 | JSON `oldPassword/newPassword/confirmPassword` | null；之后重新登录 |
| 用户新增/编辑 | `SysUserAddDTO`：`userId`（编辑）、`username/password/nickname/email/mobile/avatar/status/roleIds` | 新增为字符串ID，编辑为null |
| 资讯 | JSON `title/summary/content/coverImage/category/tags/status` | 创建为字符串ID；列表 records/total/pageNum/pageSize |
| 本人收件箱 | query `pageNum/pageSize/unreadOnly`；批量读 JSON `ids` | 列表 items/total/pageNum/pageSize；计数为Long字符串 |
| 业务配置 | `enabled/parameters/secrets/clearSecrets/revision` | section/enabled/parameters/secretsConfigured/revision/updateTime/source/effectiveState/encryptionReady |
| 低代码草稿 | `name/formKey/status/revision/schema.fields` | ID或当前表单映射 |
| 低代码记录新增/修改 | `schemaVersion/revision/data`；取发布表单schema验证 | `id/formId/schemaVersion/creator/tenantId/data/revision/createTime/updateTime` 等当前记录映射 |
| 模型凭据 | `mode` 为 `ENV` 或 `DB`；`apiKey/clearKey/revision` | 脱敏模型配置状态，无明文密钥 |
| 模型测试 | 已配置模型的 POST，无用户自定义 provider URL/body | outcome/model/returnedModel/elapsedMs/httpStatus/content/providerId/message |
| 场景业务读取 | JSON单一根字段 `context`，字段由注册的app定义 | appKey/sceneKey/publishedRevision/modelId/prompt |

用户账号2–30字符，只允许字母/数字/下划线；手机号 `^1[3-9]\d{9}$`，status=0/1。密码字段的不同流程校验不同，本人改密额外要求字母和数字。资讯状态从 `ContentService` 校验，不采用数字后台菜单status替代。更多具体业务字段及枚举见[功能手册](../features/accounts.md)。

### 关键枚举与上限

| 契约 | 当前限制 |
| --- | --- |
| 资讯status | 字符串`"0"`发布、`"1"`草稿、`"2"`下架；title最多255、summary500、category50、tags500字符 |
| 低代码表单status | 未发布为`draft`，发布后`enabled/disabled`；formKey创建后不可改 |
| 低代码字段 | 1–100个；type为text/textarea/number/date/select/multiselect/switch，fieldKey匹配`[a-z][a-z0-9_]{0,49}`且不可重复/保留 |
| 低代码文本/帮助 | label最多100，help500；文本maxLength一般最多2000，textarea最多5000 |
| 场景标识/模板 | appKey小写开头1–64字符，sceneKey1–96；模板最多12000字符，声明变量最多64，变量类型STRING/NUMBER/BOOLEAN |
| 场景读取context | 最多16个注册字段；JSON嵌套限制3、字符串512字符、请求体16KiB，禁止主体/SQL/表达式字段 |
| 模型元数据 | providerCode小写开头最多64、modelCode最多128；timeoutSeconds为1–300，endpoint为不含用户信息/query/fragment的HTTPS且最多2048字符 |
| 模型凭据 | mode仅ENV/DB；apiKey最多8192字符，clearKey不能同时传新apiKey；ENV引用为大写下划线环境变量名 |
| 用户导入 | XLSX文件最多5MiB、解压数据50MiB、最多1000行；前置请求长度最多6MiB |
| 本人通知 | pageNum最多10000、pageSize最多100；批量读1–100个正整数ID |

这些上限来自各服务/DTO，不是全局请求拦截器统一限制；例如文件multipart与用户XLSX导入有不同边界。

本人收件箱最小调用及空态：

```http
GET /api/notifications?pageNum=1&pageSize=20&unreadOnly=false
Authorization: <JWT>
```

```json
{
  "code": 200,
  "message": "成功",
  "data": { "items": [], "total": "0", "pageNum": 1, "pageSize": 20 }
}
```

低代码的新增记录请求必须针对已发布且启用的自有授权表单，schemaVersion替换为runtime中实际版本，data键只使用schema定义：

```json
{ "schemaVersion": 1, "revision": 0, "data": { "feedback": "示例填写内容" } }
```

`feedback` 是本文示例字段，不是默认内置表单。revision更新时读取记录当前版本；记录查询按 formId+tenant 条件，不统一限制为 creator 本人，不能把本人通知/文件规则复制到这里。

模型测试失败示意（**不是本次调用结果**）：

```json
{
  "code": 200,
  "message": "成功",
  "data": {
    "outcome": "RATE_LIMITED",
    "model": "your-model-code",
    "returnedModel": null,
    "elapsedMs": "123",
    "httpStatus": 429,
    "content": null,
    "providerId": null,
    "message": "供应方返回 HTTP 429"
  }
}
```

本地HTTP成功/业务code200只表示测试处理正常完成，要再看outcome及httpStatus；不能将模型配置的启用状态或历史供应商成功作为推理验收。教程不会触发真实供应商请求。

## 资源、租户与兼容边界

- 文件列表/详情/下载/删除检查当前创建者，启用租户时额外匹配tenant；操作码不提供“所有文件”能力。
- 本人通知从会话与当前数据库用户验证owner和tenant，批量最多100个，先校验全部ID再更新。
- 低代码表单管理需平台身份+操作码；记录操作需对应操作码并按服务的tenant/form条件隔离，creator由服务端写入。
- 业务场景读取只使用注册业务权限和服务端身份；默认不存在通用任意context的注册app，传占位appKey会得到APP_NOT_REGISTERED。
- `/system/oss/config` 是保留的旧读取/脱敏兼容入口；写入方法返回业务code409，要求改用业务配置，不是另一套可用存储写配置。
- 微信仅授权发起/state流程交付，完整绑定登录未交付；capability未配置应作为正常边界展示。
- `/admin/demo`、`/app/demo` 仅验证两个示例模块装配，不是两个真实业务系统的采用证明。
- `SysRoleMenuController` 和 `SysUserRoleController` 当前没有方法映射，不为它们虚构可调用API。

## 失败恢复与更新方法

权限失败检查账号操作码/平台身份/资源范围；缺失资源不枚举别人的ID；并发版本失败重读并保留输入；供应商、存储故障按单独验证计划排查。新增或变更接口后，从真实Controller和DTO更新本页，再核对[错误码](./error-codes.md)和业务功能页，不能只改路由数量。

下列各节的源码路径均相对于**后端仓库**。注解所在行号用于定位当前文档基线，后续变更时以方法名和真实代码为准。

<!-- controller-inventory -->

## SysOssConfigController

源码：`common/common-oss/src/main/java/com/xinghuiTec/oss/controller/SysOssConfigController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/oss/config/list` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:oss:config:list')` | `list` / 26 |
| GET | `/system/oss/config/{configId}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:oss:config:query')` | `getInfo` / 38 |
| POST | `/system/oss/config` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:oss:config:add')` | `add` / 45 |
| PUT | `/system/oss/config` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:oss:config:edit')` | `edit` / 52 |
| DELETE | `/system/oss/config/{configIds}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:oss:config:remove')` | `remove` / 59 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<Page<SysOssConfig>> list(@RequestParam(defaultValue = "1") Integer pageNum, @RequestParam(defaultValue = "10") Integer pageSize)
public Result<SysOssConfig> getInfo(@PathVariable Long configId)
public Result<Void> add(@RequestBody SysOssConfig config)
public Result<Void> edit(@RequestBody SysOssConfig config)
public Result<Void> remove(@PathVariable Long[] configIds)
```

:::

## AiModelConfigAdminController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/AiModelConfigAdminController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/ai/models` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:model:list')` | `page` / 46 |
| GET | `/system/ai/models/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:model:query')` | `get` / 56 |
| POST | `/system/ai/models` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:model:add')` | `create` / 62 |
| PUT | `/system/ai/models/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:model:edit')` | `update` / 69 |
| PATCH | `/system/ai/models/{id}/status` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:model:edit')` | `setEnabled` / 76 |
| DELETE | `/system/ai/models/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:model:remove')` | `delete` / 83 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<Page> page(@RequestParam(defaultValue = "1") Integer pageNum, @RequestParam(defaultValue = "20") Integer pageSize, @RequestParam(required = false) String providerCode, @RequestParam(required = false) String modelCode, @RequestParam(required = false) Boolean enabled)
public Result<View> get(@PathVariable long id)
public Result<Long> create(@Valid @RequestBody CreateRequest request)
public Result<View> update(@PathVariable long id, @Valid @RequestBody UpdateRequest request)
public Result<View> setEnabled(@PathVariable long id, @Valid @RequestBody StatusRequest request)
public Result<Void> delete(@PathVariable long id, @RequestParam int revision)
```

:::

## AiModelTestController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/AiModelTestController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| PUT | `/system/ai/models/{id}/credential` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:model:edit')` | `save` / 23 |
| POST | `/system/ai/models/{id}/test` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:model:test')` | `test` / 29 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<AiModelConfigService.View> save(@PathVariable long id,@Valid @RequestBody AiModelCredentialService.Change change)
public Result<OpenRouterModelTester.Outcome> test(@PathVariable long id)
```

:::

## AiPromptSceneAdminController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/AiPromptSceneAdminController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/ai/prompts` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:prompt:list')` | `page` / 53 |
| GET | `/system/ai/prompts/models` | `@platformAccess.isPlatformIdentity() and (hasAuthority('ai:prompt:add') or hasAuthority('ai:prompt:edit'))` | `availableModels` / 64 |
| GET | `/system/ai/prompts/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:prompt:query')` | `get` / 70 |
| POST | `/system/ai/prompts` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:prompt:add')` | `create` / 76 |
| PUT | `/system/ai/prompts/{id}/draft` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:prompt:edit')` | `updateDraft` / 82 |
| POST | `/system/ai/prompts/{id}/preview` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:prompt:query')` | `preview` / 88 |
| POST | `/system/ai/prompts/{id}/publish` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:prompt:publish')` | `publish` / 94 |
| PATCH | `/system/ai/prompts/{id}/enabled` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:prompt:enable')` | `setEnabled` / 100 |
| DELETE | `/system/ai/prompts/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:prompt:remove')` | `delete` / 106 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<Page> page(@RequestParam(defaultValue = "1") Integer pageNum, @RequestParam(defaultValue = "20") Integer pageSize, @RequestParam(required = false) String appKey, @RequestParam(required = false) String sceneKey, @RequestParam(required = false) Boolean enabled, @RequestParam(required = false) Boolean published)
public Result<java.util.List<ModelOption>> availableModels()
public Result<View> get(@PathVariable long id)
public Result<Long> create(@RequestBody CreateRequest request)
public Result<View> updateDraft(@PathVariable long id, @RequestBody DraftRequest request)
public Result<PreviewView> preview(@PathVariable long id, @RequestBody PreviewRequest request)
public Result<View> publish(@PathVariable long id, @RequestBody RevisionRequest request)
public Result<View> setEnabled(@PathVariable long id, @RequestBody StatusRequest request)
public Result<Void> delete(@PathVariable long id, @RequestParam int revision)
```

:::

## AiSceneReadController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/AiSceneReadController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| POST | `/ai/scenes/{appKey}/{sceneKey}/render` | 认证/服务校验；公开入口见正文 | `read` / 21 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<Response> read(@PathVariable String appKey,@PathVariable String sceneKey, @RequestBody byte[] body,HttpServletRequest request)
```

:::

## BusinessConfigController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/BusinessConfigController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/businessConfig` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:businessConfig:query')` | `all` / 20 |
| GET | `/system/businessConfig/{section}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:businessConfig:query')` | `get` / 23 |
| PUT | `/system/businessConfig/{section}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:businessConfig:edit')` | `save` / 26 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<List<BusinessConfigService.View>> all()
public Result<BusinessConfigService.View> get(@PathVariable String section)
public Result<BusinessConfigService.View> save(@PathVariable String section,@RequestBody BusinessConfigService.Change change)
```

:::

## DictionaryAdminController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/DictionaryAdminController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/dict/types` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:dict:list')` | `types` / 34 |
| GET | `/system/dict/types/{id}/items` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:dict:list')` | `items` / 40 |
| POST | `/system/dict/types` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:dict:type:add')` | `addType` / 46 |
| PUT | `/system/dict/types/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:dict:type:edit')` | `editType` / 53 |
| POST | `/system/dict/types/{id}/items` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:dict:item:add')` | `addItem` / 61 |
| PUT | `/system/dict/items/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:dict:item:edit')` | `editItem` / 68 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<List<TypeView>> types()
public Result<List<ItemView>> items(@PathVariable long id)
public Result<Long> addType(@Valid @RequestBody TypeCreate request)
public Result<Void> editType(@PathVariable long id, @Valid @RequestBody TypeEdit request)
public Result<Long> addItem(@PathVariable long id, @Valid @RequestBody ItemCreate request)
public Result<Void> editItem(@PathVariable long id, @Valid @RequestBody ItemEdit request)
```

:::

## DictionaryReadController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/DictionaryReadController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/dict/{code}/options` | 认证/服务校验；公开入口见正文 | `options` / 24 |
| GET | `/dict/{code}/labels/{value}` | 认证/服务校验；公开入口见正文 | `label` / 29 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<List<Option>> options(@PathVariable String code)
public Result<LabelView> label(@PathVariable String code, @PathVariable String value)
```

:::

## LoginController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/LoginController.java`。

| 方法 | 后端路径       | 注解权限                      | 方法 / 行            |
| ---- | -------------- | ----------------------------- | -------------------- |
| GET  | `/captcha`     | 认证/服务校验；公开入口见正文 | `getCaptcha` / 44    |
| POST | `/user/login`  | 认证/服务校验；公开入口见正文 | `login` / 63         |
| POST | `/user/logout` | 认证/服务校验；公开入口见正文 | `logout` / 74        |
| GET  | `/user/info`   | 认证/服务校验；公开入口见正文 | `getUserInfo` / 85   |
| GET  | `/user/router` | 认证/服务校验；公开入口见正文 | `getUserRouter` / 96 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<CaptchaVO> getCaptcha()
public Result<String> login(@RequestBody LoginDTO user)
public Result<String> logout()
public Result<UserInfoVO> getUserInfo()
public Result<List<SysMenuVO>> getUserRouter()
```

:::

## NotificationInboxController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/NotificationInboxController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/notifications` | `isAuthenticated()` | `page` / 37 |
| GET | `/notifications/unread-count` | `isAuthenticated()` | `unreadCount` / 44 |
| GET | `/notifications/{id}` | `isAuthenticated()` | `detail` / 49 |
| PUT | `/notifications/{id}/read` | `isAuthenticated()` | `markRead` / 54 |
| PUT | `/notifications/read` | `isAuthenticated()` | `markReadBatch` / 62 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<Page> page(@RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "20") int pageSize, @RequestParam(defaultValue = "false") boolean unreadOnly)
public Result<Long> unreadCount()
public Result<Item> detail(@PathVariable long id)
public Result<Void> markRead(@PathVariable long id)
public Result<Integer> markReadBatch(@Valid @RequestBody ReadBatch request)
```

:::

## SysConfigController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/SysConfigController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/sysConfig/list` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:config:list')` | `list` / 23 |
| GET | `/sysConfig/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:config:query')` | `get` / 29 |
| GET | `/sysConfig/value/{key}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:config:query')` | `value` / 35 |
| POST | `/sysConfig` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:config:add')` | `add` / 41 |
| PUT | `/sysConfig/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:config:edit')` | `edit` / 48 |
| DELETE | `/sysConfig/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:config:remove')` | `remove` / 56 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<List<ConfigView>> list()
public Result<ConfigView> get(@PathVariable Integer id)
public Result<String> value(@PathVariable String key)
public Result<Integer> add(@Validated @RequestBody ConfigChangeRequest request)
public Result<Void> edit(@PathVariable Integer id, @Validated @RequestBody ConfigChangeRequest request)
public Result<Void> remove(@PathVariable Integer id)
```

:::

## SysMenuController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/SysMenuController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/menu/list` | `hasAuthority('system:menu:list')` | `getMenuList` / 47 |
| GET | `/system/menu/tree` | `hasAuthority('system:menu:list')` | `getMenuTree` / 61 |
| GET | `/system/menu/{menuId}` | `hasAuthority('system:menu:query')` | `getMenuById` / 74 |
| POST | `/system/menu/add` | `hasAuthority('system:menu:add')` | `addMenu` / 95 |
| POST | `/system/menu/edit` | `hasAuthority('system:menu:edit')` | `updateMenu` / 113 |
| POST | `/system/menu/remove` | `hasAuthority('system:menu:remove')` | `deleteMenu` / 131 |
| POST | `/system/menu/order` | `hasAuthority('system:menu:edit')` | `updateMenuOrder` / 147 |
| GET | `/system/menu/hasChild/{menuId}` | `hasAuthority('system:menu:query')` | `hasChildMenu` / 163 |
| GET | `/system/menu/role/{roleId}` | `hasAuthority('system:menu:list')` | `getMenuListByRoleId` / 177 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<List<SysMenu>> getMenuList(@Validated SysMenuQueryDTO queryDTO)
public Result<List<SysMenuVO>> getMenuTree(@Validated SysMenuQueryDTO queryDTO)
public Result<SysMenu> getMenuById(@PathVariable("menuId") Long menuId)
public Result<Long> addMenu(@Validated @RequestBody SysMenuAddDTO addDTO)
public Result<Void> updateMenu(@Validated @RequestBody SysMenuAddDTO addDTO)
public Result<Void> deleteMenu(@RequestParam("menuId") Long menuId)
public Result<Void> updateMenuOrder( @RequestParam("menuId") Long menuId, @RequestParam("orderNum") Integer orderNum)
public Result<Boolean> hasChildMenu(@PathVariable("menuId") Long menuId)
public Result<List<SysMenu>> getMenuListByRoleId(@PathVariable("roleId") Long roleId)
```

:::

## SysNoticeController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/SysNoticeController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/notice/list` | `hasAuthority('system:notice:list')` | `getNoticeList` / 34 |
| GET | `/system/notice/{noticeId}` | `hasAuthority('system:notice:query')` | `getNoticeById` / 44 |
| POST | `/system/notice/add` | `hasAuthority('system:notice:add')` | `addNotice` / 54 |
| POST | `/system/notice/edit` | `hasAuthority('system:notice:edit')` | `updateNotice` / 65 |
| POST | `/system/notice/remove/{noticeId}` | `hasAuthority('system:notice:remove')` | `deleteNotice` / 76 |
| POST | `/system/notice/removeBatch` | `hasAuthority('system:notice:remove')` | `deleteNotices` / 87 |
| POST | `/system/notice/changeStatus` | `hasAuthority('system:notice:edit')` | `changeStatus` / 98 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<Page<SysNotice>> getNoticeList(@Validated SysNoticeQueryDTO queryDTO)
public Result<SysNotice> getNoticeById(@PathVariable Long noticeId)
public Result<Long> addNotice(@Validated @RequestBody SysNoticeAddDTO addDTO)
public Result<Void> updateNotice(@Validated @RequestBody SysNoticeAddDTO addDTO)
public Result<Void> deleteNotice(@PathVariable Long noticeId)
public Result<Void> deleteNotices(@RequestBody List<Long> noticeIds)
public Result<Void> changeStatus(@RequestParam Long noticeId, @RequestParam Integer status)
```

:::

## SysOperLogController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/SysOperLogController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/monitor/operlog/list` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:operlog:list')` | `getOperLogList` / 35 |
| POST | `/monitor/operlog/remove` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:operlog:remove')` | `deleteOperLog` / 48 |
| POST | `/monitor/operlog/clean` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:operlog:clean')` | `cleanOperLog` / 60 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<Page<SysOperLog>> getOperLogList(@Validated SysOperLogQueryDTO queryDTO)
public Result<Void> deleteOperLog(@RequestBody List<Long> operIds)
public Result<Void> cleanOperLog()
```

:::

## SysOssController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/SysOssController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| POST | `/system/oss/upload` | `hasAuthority('system:oss:upload')` | `upload` / 53 |
| GET | `/system/oss/download/{ossId}` | `hasAuthority('system:oss:download')` | `download` / 73 |
| GET | `/system/oss/list` | `hasAuthority('system:oss:list')` | `getList` / 91 |
| GET | `/system/oss/info/{ossId}` | `hasAuthority('system:oss:query')` | `getInfo` / 113 |
| POST | `/system/oss/remove` | `hasAuthority('system:oss:remove')` | `remove` / 119 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<SysOss> upload(@RequestParam("file") MultipartFile file)
public void download(@PathVariable("ossId") Long ossId, HttpServletResponse response)
public Result<Page<SysOss>> getList( @RequestParam(defaultValue = "1") Integer pageNum, @RequestParam(defaultValue = "10") Integer pageSize, @RequestParam(required = false) String originalName, @RequestParam(required = false) String fileSuffix)
public Result<SysOss> getInfo(@PathVariable("ossId") Long ossId)
public Result<Void> remove(@RequestBody List<Long> ossIds)
```

:::

## SysProfileController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/SysProfileController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/profile` | 认证/服务校验；公开入口见正文 | `getProfile` / 52 |
| PUT | `/system/profile` | 认证/服务校验；公开入口见正文 | `updateProfile` / 81 |
| PUT | `/system/profile/updatePwd` | 认证/服务校验；公开入口见正文 | `updatePassword` / 117 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<UserInfoVO> getProfile()
public Result<Void> updateProfile(@Validated @RequestBody SysProfileUpdateDTO updateDTO)
public Result<Void> updatePassword(@Validated @RequestBody SysPasswordUpdateDTO updateDTO)
```

:::

## SysRoleController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/SysRoleController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/role/list` | `hasAuthority('system:role:list')` | `getRoleList` / 42 |
| GET | `/system/role/{roleId}` | `hasAuthority('system:role:query')` | `getRoleById` / 55 |
| POST | `/system/role/add` | `hasAuthority('system:role:add')` | `addRole` / 71 |
| POST | `/system/role/edit` | `hasAuthority('system:role:edit')` | `updateRole` / 85 |
| POST | `/system/role/remove` | `hasAuthority('system:role:remove')` | `deleteRole` / 99 |
| POST | `/system/role/changeStatus` | `hasAuthority('system:role:edit')` | `updateRoleStatus` / 114 |
| GET | `/system/role/menuIds/{roleId}` | `hasAuthority('system:role:query')` | `getMenuIdsByRoleId` / 129 |
| POST | `/system/role/assignMenus` | `hasAuthority('system:role:edit')` | `assignMenus` / 143 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<Page<SysRole>> getRoleList(@Validated SysRoleQueryDTO queryDTO)
public Result<SysRole> getRoleById(@PathVariable("roleId") Long roleId)
public Result<String> addRole(@Validated @RequestBody SysRoleAddDTO addDTO)
public Result<Void> updateRole(@Validated @RequestBody SysRoleAddDTO addDTO)
public Result<Void> deleteRole(@RequestParam("roleId") Long roleId)
public Result<Void> updateRoleStatus(@RequestParam("roleId") Long roleId, @RequestParam("status") Integer status)
public Result<List<String>> getMenuIdsByRoleId(@PathVariable("roleId") Long roleId)
public Result<Void> assignMenus(@RequestParam("roleId") Long roleId, @RequestBody List<Long> menuIds)
```

:::

## SysTenantController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/SysTenantController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/tenant/list` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:tenant:list')` | `list` / 28 |
| GET | `/system/tenant/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:tenant:query')` | `getInfo` / 42 |
| POST | `/system/tenant` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:tenant:add')` | `add` / 51 |
| PUT | `/system/tenant` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:tenant:edit')` | `edit` / 61 |
| DELETE | `/system/tenant/{ids}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:tenant:remove')` | `remove` / 71 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<Page<SysTenant>> list(@RequestParam(defaultValue = "1") Integer pageNum, @RequestParam(defaultValue = "10") Integer pageSize)
public Result<SysTenant> getInfo(@PathVariable Long id)
public Result<Void> add(@RequestBody SysTenant tenant)
public Result<Void> edit(@RequestBody SysTenant tenant)
public Result<Void> remove(@PathVariable Long[] ids)
```

:::

## SysTenantPackageController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/SysTenantPackageController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/tenantPackage/list` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:tenantPackage:list')` | `list` / 27 |
| GET | `/system/tenantPackage/{packageId}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:tenantPackage:query')` | `getInfo` / 39 |
| POST | `/system/tenantPackage` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:tenantPackage:add')` | `add` / 48 |
| PUT | `/system/tenantPackage` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:tenantPackage:edit')` | `edit` / 58 |
| DELETE | `/system/tenantPackage/{packageIds}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:tenantPackage:remove')` | `remove` / 68 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<Page<SysTenantPackage>> list(@RequestParam(defaultValue = "1") Integer pageNum, @RequestParam(defaultValue = "10") Integer pageSize)
public Result<SysTenantPackage> getInfo(@PathVariable Long packageId)
public Result<Void> add(@RequestBody SysTenantPackage tenantPackage)
public Result<Void> edit(@RequestBody SysTenantPackage tenantPackage)
public Result<Void> remove(@PathVariable Long[] packageIds)
```

:::

## SysUserController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/SysUserController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/user/list` | `hasAuthority('system:user:list')` | `getUserList` / 61 |
| GET | `/system/user/{userId}` | `hasAuthority('system:user:query')` | `getUser` / 68 |
| GET | `/system/user/info` | `hasAuthority('system:user:query')` | `getUserDetail` / 89 |
| GET | `/system/user/router` | `hasAuthority('system:user:query')` | `getUserRouter` / 117 |
| POST | `/system/user/add` | `hasAuthority('system:user:add')` | `addUser` / 139 |
| POST | `/system/user/edit` | `hasAuthority('system:user:edit')` | `updateUser` / 158 |
| POST | `/system/user/remove` | `hasAuthority('system:user:remove')` | `deleteUser` / 174 |
| POST | `/system/user/resetPwd` | `hasAuthority('system:user:edit')` | `resetPassword` / 189 |
| GET | `/system/user/importTemplate` | `hasAuthority('system:user:list')` | `downloadTemplate` / 203 |
| POST | `/system/user/import` | `hasAuthority('system:user:add')` | `importUsers` / 217 |
| GET | `/system/user/export` | `hasAuthority('system:user:list')` | `exportUsers` / 234 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<Page<SysUser>> getUserList(@Validated SysUserQueryDTO sysUserQueryDTO)
public Result<Map<String, Object>> getUser(@PathVariable Long userId)
public Result<UserDetailVO> getUserDetail()
public Result<UserDetailVO> getUserRouter()
public Result<String> addUser(@Validated @RequestBody SysUserAddDTO sysUserAddDTO)
public Result<Void> updateUser(@Validated @RequestBody SysUserAddDTO sysUserAddDTO)
public Result<Void> deleteUser(@RequestParam("userId") Long userId)
public Result<String> resetPassword(@RequestParam("userId") Long userId)
public void downloadTemplate(HttpServletResponse response) throws Exception
public Result<UserImportSummary> importUsers(@RequestPart("file") MultipartFile file)
public void exportUsers(@Validated SysUserQueryDTO sysUserQueryDTO, HttpServletResponse response) throws Exception
```

:::

## WechatAuthorizationController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/WechatAuthorizationController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/auth/wechat/capability` | 认证/服务校验；公开入口见正文 | `capability` / 29 |
| POST | `/auth/wechat/authorize` | 认证/服务校验；公开入口见正文 | `authorize` / 40 |
| GET | `/auth/wechat/callback` | 认证/服务校验；公开入口见正文 | `callback` / 65 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<Capability> capability()
public Result<Authorization> authorize(HttpServletRequest request, HttpServletResponse response)
public ResponseEntity<Void> callback(@RequestParam(required = false) String state, @RequestParam(required = false) String code, HttpServletRequest request)
```

:::

## WechatConfigController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/WechatConfigController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/wechat/config` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:wechat:query')` | `get` / 16 |
| PUT | `/system/wechat/config` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:wechat:edit')` | `save` / 19 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<WechatConfigService.Config> get()
public Result<WechatConfigService.Config> save(@RequestBody WechatConfigService.Change change)
```

:::

## LowcodeFormController

源码：`system-admin/src/main/java/com/xinghuiTec/lowcode/LowcodeFormController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/lowcode/forms` | `@platformAccess.isPlatformIdentity() and hasAuthority('lowcode:form:list')` | `list` / 44 |
| GET | `/lowcode/forms/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('lowcode:form:query')` | `get` / 51 |
| POST | `/lowcode/forms` | `@platformAccess.isPlatformIdentity() and hasAuthority('lowcode:form:add')` | `create` / 57 |
| PUT | `/lowcode/forms/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('lowcode:form:edit')` | `update` / 63 |
| POST | `/lowcode/forms/{id}/publish` | `@platformAccess.isPlatformIdentity() and hasAuthority('lowcode:form:publish')` | `publish` / 69 |
| DELETE | `/lowcode/forms/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('lowcode:form:remove')` | `remove` / 75 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<LowcodeService.Page> list(@RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "10") int pageSize, @RequestParam(required = false) String name)
public Result<Map<String, Object>> get(@PathVariable long id)
public Result<String> create(@RequestBody LowcodeService.Draft input)
public Result<Map<String, Object>> update(@PathVariable long id, @RequestBody LowcodeService.Draft input)
public Result<Map<String, Object>> publish(@PathVariable long id, @RequestBody LowcodeService.VersionRequest input)
public Result<Void> remove(@PathVariable long id, @RequestParam int revision)
```

:::

## LowcodeRecordController

源码：`system-admin/src/main/java/com/xinghuiTec/lowcode/LowcodeRecordController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/lowcode/forms/{formId}/runtime` | `hasAnyAuthority('lowcode:record:list','lowcode:record:query','lowcode:record:add','lowcode:record:edit','lowcode:record:remove')` | `runtime` / 44 |
| GET | `/lowcode/forms/{formId}/records` | `hasAuthority('lowcode:record:list')` | `list` / 50 |
| GET | `/lowcode/forms/{formId}/records/{recordId}` | `hasAuthority('lowcode:record:query')` | `get` / 58 |
| POST | `/lowcode/forms/{formId}/records` | `hasAuthority('lowcode:record:add')` | `create` / 64 |
| PUT | `/lowcode/forms/{formId}/records/{recordId}` | `hasAuthority('lowcode:record:edit')` | `update` / 70 |
| DELETE | `/lowcode/forms/{formId}/records/{recordId}` | `hasAuthority('lowcode:record:remove')` | `remove` / 77 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<Map<String, Object>> runtime(@PathVariable long formId)
public Result<LowcodeService.Page> list(@PathVariable long formId, @RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "10") int pageSize, @RequestParam(required = false) String filterField, @RequestParam(required = false) String filterValue)
public Result<Map<String, Object>> get(@PathVariable long formId, @PathVariable long recordId)
public Result<Map<String, Object>> create(@PathVariable long formId, @RequestBody LowcodeService.Submission input)
public Result<Map<String, Object>> update(@PathVariable long formId, @PathVariable long recordId, @RequestBody LowcodeService.Submission input)
public Result<Void> remove(@PathVariable long formId, @PathVariable long recordId, @RequestParam int revision)
```

:::

## SysJobController

源码：`system-admin/src/main/java/com/xinghuiTec/quartz/controller/SysJobController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/monitor/job/handlers` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:job:list')` | `handlers` / 37 |
| GET | `/monitor/job/{jobId}/fires` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:job:query')` | `fires` / 43 |
| POST | `/monitor/job/{jobId}/run` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:job:run')` | `run` / 49 |
| PUT | `/monitor/job/{jobId}/status` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:job:changeStatus')` | `changeStatus` / 55 |
| GET | `/monitor/job/list` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:job:list')` | `list` / 66 |
| GET | `/monitor/job/{jobId}` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:job:query')` | `getInfo` / 84 |
| POST | `/monitor/job` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:job:add')` | `add` / 93 |
| PUT | `/monitor/job` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:job:edit')` | `edit` / 102 |
| DELETE | `/monitor/job/{jobIds}` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:job:remove')` | `remove` / 112 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<List<String>> handlers()
public Result<List<JobEngine.FireView>> fires(@PathVariable Long jobId)
public Result<Long> run(@PathVariable Long jobId)
public Result<Void> changeStatus(@PathVariable Long jobId, @Validated @RequestBody StatusChangeRequest request)
public Result<Page<SysJob>> list(SysJob job, @RequestParam(defaultValue = "1") Integer pageNum, @RequestParam(defaultValue = "10") Integer pageSize)
public Result<SysJob> getInfo(@PathVariable("jobId") Long jobId)
public Result<Long> add(@Validated @RequestBody JobChangeRequest job)
public Result<Void> edit(@Validated @RequestBody JobChangeRequest job)
public Result<Void> remove(@PathVariable List<Long> jobIds)
```

:::

## SysJobLogController

源码：`system-admin/src/main/java/com/xinghuiTec/quartz/controller/SysJobLogController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/monitor/jobLog/list` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:jobLog:list')` | `list` / 25 |
| GET | `/monitor/jobLog/{fireId}` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:jobLog:query')` | `detail` / 37 |
| DELETE | `/monitor/jobLog/clean` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:jobLog:clean')` | `clean` / 43 |
| DELETE | `/monitor/jobLog/{fireIds}` | `@platformAccess.isPlatformIdentity() and hasAuthority('monitor:jobLog:remove')` | `remove` / 49 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<JobFireLogService.FirePage> list( @RequestParam(defaultValue = "1") Integer pageNum, @RequestParam(defaultValue = "10") Integer pageSize, @RequestParam(required = false) Long jobId, @RequestParam(required = false) String jobName, @RequestParam(required = false) String status, @RequestParam(required = false) String triggerType)
public Result<JobFireLogService.FireLog> detail(@PathVariable Long fireId)
public Result<Integer> clean()
public Result<Integer> remove(@PathVariable List<Long> fireIds)
```

:::

## AdminDemoController

源码：`web-admin/src/main/java/com/xinghuiTec/app/admin/controller/AdminDemoController.java`。

| 方法 | 后端路径      | 注解权限                      | 方法 / 行   |
| ---- | ------------- | ----------------------------- | ----------- |
| GET  | `/admin/demo` | 认证/服务校验；公开入口见正文 | `demo` / 23 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<String> demo()
```

:::

## MobileDemoController

源码：`web-app/src/main/java/com/xinghuiTec/app/mobile/controller/MobileDemoController.java`。

| 方法 | 后端路径    | 注解权限                      | 方法 / 行   |
| ---- | ----------- | ----------------------------- | ----------- |
| GET  | `/app/demo` | 认证/服务校验；公开入口见正文 | `demo` / 23 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<String> demo()
```

:::

## 实用改造接口

本轮增加对话持久化、独立AI配置页的多渠道/命名多Key与模型扫描，以及实际数据库引用；配置、数据预览、引用保存和对话阅读已原生验证，真实供应商限制见[版本组合](../releases/versions.md)。新对话保存完整用户/助手正文，技术请求日志与旧无正文记录保持区别；普通授权数据预览不统一掩码。旧应用发布流程保留为兼容参考。

### 对话与模型设置

下表config/model/scene/record动作分别使用完整前缀ai:config、ai:model、ai:scene、lowcode:record；audit与query指对应ai:request动作，未列出的动作不会由入口权限自动授予。

| 方法路径 | 请求/权限 | 成功data |
| --- | --- | --- |
| GET `/ai/conversations` | scope默认OWN，sceneKey/requestKind/search/pageNum/pageSize；本人invoke或request:list，AUDIT须平台+request:list+request:audit | Page，total字符串 |
| GET `/ai/conversations/{id}` | 本人ai:scene:invoke或ai:request:query；他人AUDIT另需平台+audit+query | Detail，完整持久化messages |
| POST `/ai/conversations` | sceneKey/kind/businessRef/message/clientMutationId/test；本人invoke，TEST另需平台+scene:test与确认 | HTTP202 Accepted |
| POST `/ai/conversations/{id}/messages` | expectedRevision/message/clientMutationId/test；仅本人续聊及当前调用/数据权限 | HTTP202 Accepted |
| GET `/system/ai/settings/providers` | 平台+config:list/query/add/edit/test任一或对应旧model动作 | Provider候选、默认地址与模型建议 |
| GET `/system/ai/settings` | 平台+config:list或model:list，pageNum/pageSize/search | Page |
| GET `/system/ai/settings/{id}` | 平台+config:query或model:query | View |
| POST `/system/ai/settings` | 平台+config:add或model:add；Change | View |
| PUT `/system/ai/settings/{id}` | 平台+config:edit或model:edit；Change含expectedRevision | View |
| POST `/system/ai/settings/{id}/connection-tests` | 平台+config:test或model:test；confirmedCosts/activateOnSuccess；启用另需config:enable | HTTP202 TestRun |
| GET `/system/ai/settings/{id}/connection-tests/{testId}` | 平台+config:test或model:test | TestRun |

Change为expectedRevision/name/provider/endpointUrl/apiKey/modelCodes/keys/clientMutationId；新增expectedRevision=null，编辑必须提供当前revision。provider为openrouter或deepseek，endpointUrl可省略使用所选服务商官方地址，不允许自定义供应商地址。Provider候选为可读名称、官方地址及建议模型；建议不能代替实时扫描或连接测试。

更新时provider/endpointUrl省略保留原渠道；已被使用的配置不能更换服务商或地址，需新增独立渠道再调整场景。场景仍使用的模型不能删除全部声明关联，运行维护无法安全完成时返回409并保留原连接。

keys为完整目标集合：每项`{keyId?,name,apiKey?,modelCodes?}`，省略keyId是新增且必须填Key，已有keyId必须属于本配置，apiKey空/null保留材料。keys提供时，未包含的旧Key会从目标草稿移除；1..16项，name非空且最多80字符，无重复Key。每Key可关联多个模型，同模型可关联多个Key；modelCodes省略表示渠道全部模型，显式列表必须非空且属于渠道模型。顶层modelCodes可由显式Key关联并集推导；最多16模型、64组关联，不允许重复模型。

keys省略兼容原单Key格式并保留原Key集合及关联。旧顶层apiKey非空只允许当前恰好一个Key时更换；多Key配置必须明确具体Key，不能默改第一项。keys和非空顶层apiKey同时提供为400。示例中的模型代码均应来自扫描结果：

```json
{
  "expectedRevision": 3,
  "clientMutationId": "12345678-1234-4234-8234-123456789abc",
  "name": "日常问答主渠道",
  "provider": "openrouter",
  "modelCodes": ["vendor/model-a", "vendor/model-b"],
  "keys": [
    {
      "keyId": "11",
      "name": "主账号",
      "apiKey": null,
      "modelCodes": ["vendor/model-a", "vendor/model-b"]
    },
    {
      "name": "备用账号",
      "apiKey": "仅密码框输入的新Key",
      "modelCodes": ["vendor/model-a"]
    }
  ]
}
```

clientMutationId可省略；提供时必须为规范UUID。同一主体/租户及mutation的同内容重放不会重复创建或保存，返回该配置当前可读结果；同标识不同内容409。重试必须保留原标识和内容，确认成功后下一次编辑使用新标识。响应未确认时先查询原结果，不把重新点击变成新建重复渠道。

View包含configId/revision/name/provider/endpointUrl/models/active/connection/pendingChanges及keys。keys每项为keyId/name/keyConfigured/maskedKey/modelCodes/status/message/models，模型结果含code/status/message；只给尾号与安全状态，不回显Key、密文、ENV或内部版本搭配。pendingChanges表示修改待测试，原active仍可继续使用；原成功结果不冒充新材料成功。

TestRun新增keys逐Key结果，models仍提供逐模型聚合；同模型任一实际关联Key通过即可用，失败Key仍显示原因。只有声明的关联进入测试，未变且有效的证明可复用。具备启用权限且仍匹配当前草稿时，可自动启用真实通过的关联；PARTIAL说明部分成功，零通过/取消/草稿变化保留原active。保存不发生成请求，连接测试才会实际调用。

多个渠道可同时active；场景模型候选包含configId/configName/providerCode/modelCode。运行先尝试当前模型合格Key，再按场景允许的备用模型/渠道顺序执行，总尝试/时限/令牌预算共享。Key材料401后隔离并需重新验证；已输出部分内容、取消、当前授权失败或不可重试错误不切换，不拼接其他模型回答。技术执行细节见[扩展说明](../development/ai-extension.md#多-key-配置与运行切换)。

会话message最长2048字符。TEST的test为expectedSceneRevision/modelIndex/confirmedCosts；同mutation同内容重放原结果，不同内容409，同会话已有在途返回CONVERSATION_BUSY。Accepted含conversationId/revision/requestId/sceneVersionId/userMessageId/assistantMessageId/status/contextTruncated/contextStartMessageId。Detail.messages按sequence排列，含role/content/status/errorCode/partial/时间，失败不伪造成功回答。只有成对成功轮参与后续上下文，最近最多20个成功轮次并受容量上限约束；截断明确说明，不删除展示历史。

旧请求标记LEGACY_NO_BODY，提示“旧记录未保留对话”。原SSE与取消路径继续使用，仍检查owner、tenant及当前数据权限；审计查看不是本人续聊授权。

### 模型目录与 Key 扫描

Controller为`controller/AiModelCatalogController.java`，Java请求/响应为`ai.config.AiModelCatalogDtos`。以下接口均需平台身份，响应`Cache-Control:no-store`，沿用Result外层；扫描不保存配置、不启用模型、不调用生成接口。

| 方法路径 | 输入与最小动作 | 成功data |
| --- | --- | --- |
| GET `/system/ai/model-catalog` | search/pageNum/pageSize；config:query或model:query | OpenRouter公共Page，不发送Key |
| POST `/system/ai/model-catalog/scan` | configId/keyId/expectedRevision/search/pageNum/pageSize；config:test或model:test | 已保存当前草稿中选定Key的Page |
| POST `/system/ai/model-catalog/draft-scan` | provider/apiKey/可选endpointUrl/search/pageNum/pageSize；config:add/edit/test或对应model动作任一 | 未保存Key的Page，可先扫描、选择模型再保存 |
| GET `/system/ai/model-catalog/scans/{scanId}` | search/pageNum/pageSize；config:add/edit/test或对应model动作任一 | 本人未过期扫描票据的Page，分页不再提交Key |
| POST `/system/ai/model-catalog/attach` | configId/keyId/expectedRevision/catalogScanId；config:add/edit/test或对应model动作任一 | 票据绑定实际保存材料后的StoredCatalog |
| GET `/system/ai/model-catalog/channels/{configId}` | 可选keyId/search/pageNum/pageSize；config:query或model:query | 持久StoredCatalog，不访问上游 |

草稿扫描`provider`为openrouter/deepseek/openai/siliconflow，apiKey为WRITE_ONLY且toString脱敏；只在内存用于本次认证，不入库/操作日志或响应。仅接收application/json，正文最多16KiB，严格拒绝未知/重复字段、过深JSON及尾随内容。完整Key最多8192字符，不能包含控制字符；可选endpointUrl必须等于对应官方规范地址，不能提交任意兼容URL。保存Key扫描不接收Key材料或keyVersion，只在当前配置草稿内按keyId映射读取；请求前后核对revision，发生更改409，不能把旧Key结果标成新Key结果。

pageNum至少1，pageSize为1..100（GET默认1/20，POST显式提供），search可省略、最多128字符；在本次有界目录内按模型名称/代码搜索与分页。Page字段为records/total/pageNum/pageSize/refreshedAt/source/provider/configId/keyId/revision/generationVerified，其中total为整数；records每项为code/name/contextLength/maxCompletionTokens/inputModalities/outputModalities/supportedParameters。未提供的元数据为null或空数组，缺少名称回退code，不猜测工具或JSON能力。

Page另含scannedCount/filteredCount/filterReasons，统计整个上游有界目录，不受搜索与分页影响；total仍是可选模型中按当前搜索匹配的数量。与配置/执行代码规则不兼容的路由别名（例如以`~`开头）、显式无text输出的模型、不支持的元数据形状及重复code按条过滤，原因分别为UNSUPPORTED_MODEL_CODE/NON_TEXT_OUTPUT/INVALID_METADATA/DUPLICATE_MODEL_CODE。一条新别名不导致其他合法聊天模型丢失；返回列表中的代码仍须能通过实际配置校验，不扩大生成适配器支持范围。秘密回显、非法控制字符、严格JSON解析及响应大小限制继续失败关闭，不以条目兼容为由放宽。

contextLength和maxCompletionTokens为可空Java Long，实际REST遵循全局Long序列化规则，以十进制字符串返回，例如`"262144"`；客户端类型需兼容null/字符串及数字形式，不应强制断言为number。scannedCount、filteredCount、total、pageNum和pageSize为int，仍是JSON数字。

source为PUBLIC（无Key OpenRouter公共目录）、USER_FILTERED（OpenRouter带Key）或PROVIDER_KEY（其他官方带Key）。公共与草稿扫描的configId/keyId/revision均null，保存Key扫描返回这三项。Page另有可选catalogScanId；按票据分页读取相同有界结果，主动scan才刷新上游。generationVerified固定false。

StoredCatalog包含configId/revision/provider/endpointUrl/state/catalog/sources。state为NOT_FETCHED/FETCHED/PARTIAL/STALE；每项sources为catalogScanId/keyId/refreshedAt/source/current/scannedCount/filteredCount/filterReasons/catalogEndpoint。current仅表示凭据与端点关联仍当前有效，不等于Key推理通过。已保存扫描自动附着，草稿附着必须匹配主体、规范端点、供应商与凭据指纹；未附着票据24小时有效，Key或端点改变后结果过期。目录持久化不保存Key明文，分页读取不重新提交Key。

官方端点来自唯一`AiProviderPresets`：OpenRouter公共`GET /api/v1/models`，带Key`GET /api/v1/models/user`；DeepSeek带Key`GET /models`，OpenAI带Key`GET /v1/models`，SiliconFlow带Key`GET /v1/models?sub_type=chat`。OpenRouter带Key结果按用户供应商偏好、隐私和防护规则过滤；元数据仅采用服务端明确声明值。目录可选性不保证余额、额度、推理时服务可用或生成成功。

单次出站最多15秒、响应最多4MiB/5000条模型、并发4；仅官方HTTPS固定地址，禁止重定向及调用者URL，沿用公网地址规则与运维代理配置。错误message为固定`AI_MODEL_CATALOG:`前缀，无供应商原始正文/Key/堆栈：400 INVALID_INPUT/KEY_REQUIRED；413 REQUEST_LIMIT；404 KEY_NOT_FOUND；409 CONFIG_CHANGED/CONFIG_UNAVAILABLE；422 PROVIDER_UNSUPPORTED；429 RATE_LIMITED；502 UPSTREAM_UNAUTHORIZED/UPSTREAM_FORBIDDEN/UPSTREAM_FAILED/UPSTREAM_REDIRECT/UPSTREAM_INVALID/RESPONSE_LIMIT；503 CREDENTIAL_UNAVAILABLE/NETWORK_UNAVAILABLE/BUSY；504 TIMEOUT。上游401/403映射502，不能据此清除本系统登录态；本地动作拒绝仍403。扫描Controller失败Result.code为202，权限处理为309，HTTP状态和安全message同时保留。

### 数据库引用与实际值预览

以下均要求平台身份和ai:scene:query/add/edit/test任一管理动作。db.来源还需独立ai:data:database:read，低代码来源另需record:query，集合候选另需record:list；运行时仍重新检查，不由场景选中扩权。

| 方法路径 | 输入 | data |
| --- | --- | --- |
| GET `/system/ai/scene-data/database/tables` | keyword/pageNum/pageSize | `Page<DatabaseTable>`：sourceKey/tableName/label/comment/primaryKey |
| GET `/system/ai/scene-data/database/fields` | sourceKey | DatabaseFields：fields含field/label/comment/type/nullable/primaryKey |
| GET `/system/ai/scene-data/database/relations` | sourceKey | DatabaseRelation[]：name/parentSourceKey/parentField/childSourceKey/childField/foreignKey |
| POST `/system/ai/scene-data/database/records` | sourceKey/filters/limit | DatabaseRecords：records含key/label/values/businessRef，另含truncated |
| POST `/system/ai/scene-data/bindings/preview` | bindings/businessRef | BindingPreview：values、reads、notices；实际普通授权值 |

DataBinding为variable/label/sourceKey/mode/fields/filters/limit/row/relation。模式FIELD返回单值，ROW对象，TABLE/CHILDREN数组；空fields固定该次编译所有可读字段。ROW/FIELD的row为currentRecord/key，固定key须匹配真实主键；CHILDREN的relation为parentVariable/parentField/childField，引用前面的ROW并实际用主值约束子行。

sourceKey为db.加真实表名或lowcode.加表单ID。filters为field/operator/value列表，operator为EQ/NE/GT/GE/LT/LE/CONTAINS/IS_NULL/NOT_NULL；最多16个AND条件，null操作value须null。表及字段只接受真实元数据，值参数化。没有任意SQL或动态表达式入口。

Definition新增同型dataBindings，并映射EditorInput.bindings；CompiledScene.bindings保存完整BindingSnapshot及查询依赖指纹，未投影的过滤/PK/关联字段也复核。已保存场景预览使用同次渲染的RenderedScene.bindingPreview，不重新编译原Definition或二次查询。支持中文与点号的变量可由选择器一键插入，单次替换。原outputRequirement若非空先无损合并进promptText；新界面只编辑合并正文。

候选返回的businessRef可直接用于预览与运行：低代码为lowcode.record及formId:recordId；通用数据库为database.record及db1.前缀base64url引用，承载sourceKey和主键映射，最长2048字符。服务端解析、核对权限与真实来源，引用本身不授予读取权；后续请求/会话持久化与重连须保留完整内容。

最多16绑定、64字段和每绑定200行；两POST仅application/json及identity编码，128KiB正文上限。读取最多10秒且受调用deadline，选择器独立数据预览值上限256KiB；已保存场景渲染与模型总消息（提示词、数据及历史）合计上限64KiB。长文本字段8192字符截断有提示，结构化JSON解析失败或超限明确拒绝。response为no-store/private，values保留数字/null/数组；reads含variable/sourceKey/rowCount/truncated。低代码旧记录缺少后来新增字段时返回null及FIELD_NOT_IN_RECORD_SCHEMA。

通用目录排除认证/凭据/配置等基础设施和秘密字段；JSON/\_json列递归过滤秘密键。已知业务动作、实际tenant与软删条件继续执行。单列FK可直接发现，复合FK不按单列冒充；无可读主键的表仅支持有界TABLE。详细接缝见[数据绑定扩展](../development/ai-extension.md)。

### 业务模型中心

以下接口前缀为`/system/ai/settings/model-hub/models`，均要求平台身份，动作权限独立核对；不会开放给租户编辑。

| 方法与相对路径 | 动作权限 | 请求与结果 |
| --- | --- | --- |
| GET `/` | ai:config:query | pageNum/pageSize/search；真实Page分页，total为字符串 |
| GET `/summary` | ai:config:query | 全量有界配置汇总，含模型总数、启用/就绪/停用、多供应商保障及observedAt；非实时网络探测 |
| GET `/{id}` | ai:config:query | Model及安全的routes/health |
| POST `/` | ai:config:add | Change；创建，启用还需enable |
| PUT `/{id}` | ai:config:edit | Change+expectedRevision；CAS及主体内mutation幂等 |
| POST `/{id}/enabled` | ai:config:enable | expectedRevision/clientMutationId/enabled |
| DELETE `/{id}` | ai:config:edit | expectedRevision；当前场景引用返回409 |
| POST `/{id}/tests` | ai:config:test | expectedRevision/clientMutationId/confirmedCosts:true；202真实TestView |
| GET `/{id}/tests/{requestId}` | ai:config:test | 本人/租户专属TestView与真实attempts，不授予普通对话读取权 |
| POST `/{id}/tests/{requestId}/cancel` | ai:config:test | 空JSON；取消原请求，重复操作与已结束状态稳定，不产生新调用 |

Change含name、slug、capabilities、contextWindow、enabled、strategy（PRIORITY/ROUND_ROBIN）、fallback、routes及clientMutationId；route含routeId、channelId、upstreamModel、enabled。能力与上下文说明可空，不猜供应商规格；slug创建后稳定，当前最多512个未删除业务模型，每模型最多16个绑定。上游必须是该渠道实际配置的关联；纯目录元数据不会自动获得执行资格。

TestView含requestId/status/errorCode/attemptCount/deadline/attempts；每次尝试含number、providerCode、upstreamModel、status、errorCode、switchReason和elapsedMs。未知字段保持null，不含Key、隐藏提示词或供应商原始正文。生成请求费用需显式确认，受理不等于成功。

Definition新增可空businessModel（稳定slug），新场景选择时与initialModel/modelPolicy互斥；已配置场景正文缺省保持原选择，更换仍走scene-routes。旧固定Key路线不自动迁移。SQL助手未配置场景可选businessModel替代initialModel，已有场景不接受临时改路由；业务模型在每个新请求准入时冻结，执行与历史不随编辑改变。

### 提示词查询助手与独立路由

以下路径分别来自后端`ai/query/SceneQueryController`、`ai/scene/SqlAssistanceController`和`ai/scene/SceneRoutingController`。SQL入口是受控业务数据集查询，不向用户开放数据库连接或权限登记。

| 方法 | 后端路径 | 权限与边界 | 请求与返回 |
| --- | --- | --- | --- |
| GET | `/system/ai/scene-data/sql/catalog` | scene query/add/edit/test/invoke任一；目录再按实际业务政策过滤 | keyword/pageNum/pageSize；Page&lt;DatasetOption&gt; |
| POST | `/system/ai/scene-data/sql/schema` | 同上，datasetKeys只缩小已有权限 | QueryContext；AuthorizedSchema |
| POST | `/system/ai/scene-data/sql/validate` | 同上；仅语法、权限元数据检查，不读样本 | QueryRequest；SqlValidation |
| POST | `/system/ai/scene-data/sql/preview` | 同上；每来源强制租户/个人政策与软删除，数据库强制只读 | QueryRequest；QueryResult |
| POST | `/ai/scenes/sql-assistance` | 平台+scene:test及scene:add/edit任一 | Start；202 Accepted |
| GET | `/ai/scenes/sql-assistance/{requestId}` | 同上+本人/租户及当前数据授权 | View；仅SUCCEEDED公开审核后的query |
| POST | `/ai/scenes/sql-assistance/{requestId}/cancel` | 同上；不产生新模型调用 | 空JSON；View |
| GET | `/system/ai/settings/scene-routes/{sceneKey}` | 平台+config:query+scene:query | View，含revision/currentVersionId/modelPolicy |
| PUT | `/system/ai/settings/scene-routes/{sceneKey}` | 平台+config:edit+scene:edit，共用场景CAS | expectedRevision/clientMutationId/modelPolicy；Saved |

本表省略的权限前缀均为`ai:`，例如scene:query即`ai:scene:query`。低代码数据仍要求`lowcode:record:list/query`；泛用数据库数据集还需要平台身份和`ai:data:database:read`，不能以scene权限替代。服务端登记的租户或个人业务政策只开放相应数据集。

QueryContext为datasetKeys/businessRef，QueryRequest在此基础上增加query。SqlQuery包含sql（最多16000字符）、parameters（最多32个业务参数）和maxRows（1–200）。当前用户/租户/记录保留参数由服务端绑定，客户端同名值拒绝。SQL请求最多64KiB，返回值不缓存；只读试查最多256KiB和10秒。无效SQL不能直接进入JDBC，数据库强制只读失败会停止查询。

AuthorizedSchema含datasets、supportedSyntax、trustedParameters、scopeDescription和fingerprint；DatasetOption给出可读名称及范围，具体schema增加columns及schemaFingerprint。SqlValidation返回valid/normalizedSql/columns/diagnostics/schemaFingerprint/currentRecordDatasetKey/usedDatasetKeys，最后一项来自实际AST依赖，供保存和说明缩小到真正使用的来源。动态当前记录查询可先静态校验，不以缺少样本记录假装取数成功；实际read才核对业务记录。QueryResult为columns/rows/rowCount/truncated/notices；rows中的数值以精确字符串返回，SQL类型由columns说明，null及布尔值保留。参数中的精确数值采用`{"$number":"9007199254740993123"}`，不能先转为JavaScript Number。

SQL辅助Start为sceneKey/expectedSceneRevision/description/datasetKeys/businessRef/initialModel/expectedSchemaFingerprint/confirmedCosts/clientMutationId/maxRows。已有场景使用完整现有路由，initialModel仅用于未配置场景。Accepted为requestId/status/scopeDescription/schemaFingerprint，View另含query、diagnostics、errorCode和deadline。状态为QUEUED/RUNNING/VALIDATING/SUCCEEDED/FAILED/CANCELLED/TIMED_OUT/INCOMPLETE；生成不会执行SQL或保存引用，不通过普通SSE公开原始模型输出。

语法诊断使用QueryIssue固定枚举；鉴权403、静态定义变化409、执行非法语法422、内容类型415、体积413、查询超时504、强制只读不可用503。不要将模型生成成功、HTTP202受理或静态valid当成业务数据查询成功。

## 场景工作区与直接保存接口

本节描述一期工作区改造合同，精确源码与验证边界见[版本组合](../releases/versions.md)。sceneKey由服务端生成，sceneVersionId为不可变执行版本，均与旧appId不同；所有ID及分页total为字符串。旧版接口在下一节按原源码保留，不能把旧发布操作当作新场景的保存前置。

下表保留2026-10-17一期工作区20条映射的盘点；本轮对话、设置和5条数据库绑定接口另列前节，SSE沿用原路径。

| Controller | 源码（后端system-admin/src/main/java/com/xinghuiTec/下） | 新增映射数 |
| --- | --- | --- |
| SceneAdminController | ai/scene/SceneAdminController.java | 8：列表、工作区、详情、新增、保存、启停、模型及Key候选 |
| SceneRuntimeController | ai/scene/SceneRuntimeController.java | 7：业务候选、摘要入口、提交、试运行、预览、状态及取消 |
| SceneDataController | ai/scenedata/SceneDataController.java | 4：对象、表单、字段及样本候选 |
| SceneMonitorController | ai/scene/SceneMonitorController.java | 1：监控摘要 |

| 方法与路径 | 请求/查询 | 成功data与限制 |
| --- | --- | --- |
| GET `/system/ai/scenes` | `pageNum,pageSize,search` | Page；需平台身份及ai:scene:list |
| GET `/system/ai/scenes/workspace` | 分页、search、selectedSceneKey | Workspace；平台+ai:scene:list，带selectedSceneKey还需ai:scene:query |
| GET `/system/ai/scenes/{sceneKey}` | 无正文 | Detail；平台+ai:scene:query |
| POST `/system/ai/scenes` | `name,purpose,kind,formId,clientMutationId` | 创建稳定身份，初始无有效配置；平台+ai:scene:add |
| PUT `/system/ai/scenes/{sceneKey}` | `expectedRevision,clientMutationId,definition,confirmedLegacyConversion` | SaveResult；平台+ai:scene:edit，CAS保存即供新调用使用 |
| POST `/system/ai/scenes/{sceneKey}/enabled` | `expectedRevision,clientMutationId,enabled` | 保持配置与启停独立；平台+ai:scene:enable |
| GET `/system/ai/scenes/options/models` | `outputFormat` | 安全模型候选；平台+下述候选动作，无供应商调用 |
| GET `/system/ai/scenes/options/keys` | `modelRef,configVersion` | Key候选；平台+下述候选动作，不含凭据/envName |
| POST `/system/ai/scenes/{sceneKey}/preview` | `expectedRevision,businessRef,inputs` | 固定已保存版本的授权脱敏预览，不调用模型；平台+ai:scene:test+ai:scene:invoke |
| POST `/system/ai/scenes/{sceneKey}/test-requests` | `expectedRevision,modelIndex,confirmedCosts,submission`，confirmedCosts须true | HTTP202 Request；平台+ai:scene:test+ai:scene:invoke，主动模型调用 |
| GET `/ai/scenes` | `kind,formId` | 有权业务Entry候选，最多100条；ai:scene:invoke及实际范围 |
| GET `/ai/scenes/record-summary` | `formId` | Entry或null，不返回内部appId |
| POST `/ai/scenes/{sceneKey}/requests` | `businessRef,inputs,idempotencyKey` | HTTP202 Request；固定当前版本，受理不等于生成成功 |
| GET `/ai/scenes/requests/{requestId}` | 无正文 | 原请求状态，严格owner+tenant+当前访问 |
| POST `/ai/scenes/requests/{requestId}/cancel` | 无正文 | 原请求状态；不撤回已输出内容 |
| GET `/ai/requests/{requestId}/events` | 原JWT及Last-Event-ID | 既有有界SSE；断线查原请求，不自动补发 |
| GET `/system/ai/monitor/summary` | `scope,requestKind,from,to,sceneKey,modelRef,result` | 真实窗口监控，默认OWN/最近24h，最长31天；监控入口及各统计范围按下述权限检查 |

模型和Key候选要求平台身份及ai:scene:query/add/edit/test任一动作，不要求同时拥有全部动作。业务候选、摘要入口、提交、状态和取消都要求ai:scene:invoke，并继续检查实际主体及业务范围；请求ID不是授权凭据。

Definition含name、purpose、promptText、outputRequirement、dataObjects及modelPolicy。dataObjects每项为objectKey/formId/fields；摘要场景可省略对象formId而使用头部绑定，提供时必须与头部一致；GENERAL场景使用数据对象时必须提供有权选择的formId，无数据对象时可省略businessRef；modelPolicy按SceneDtos声明提交，模型/Key来自候选。SaveResult含detail、clientMutationId、effectiveFrom。没有有效配置时不可运行；合法保存不读记录、不测试Key、不调用模型，模型暂不可用不阻止保存。无效配置400不切换旧有效版本，409保留本地输入处理冲突。

旧场景Detail另含legacy，提供compatibility（CONVERTIBLE/READ_ONLY）、reasons、requiresConfirmation、conversionNotes、editor、originalMessages及originalDefinition。首次从旧执行版本转换时，应先展示差异，用户明确确认后在Save中传 `confirmedLegacyConversion:true`；可省略时默认false。需要确认而未确认返回409 `LEGACY_CONVERSION_CONFIRMATION_REQUIRED`，不改变原执行版本。后续已转换快照不重复确认，但每次保存仍校验同一原基线和批准范围；READ_ONLY保留原配置，不能以确认标识绕过。

例如GENERAL场景的dataObjects可为 `[{"objectKey":"lowcode.record","formId":"42","fields":["subject"]}]`；42只是结构示例，实际ID来自有权表单候选。kind为GENERAL不意味着允许任意表单或字段。

管理预览和主动试运行同时要求平台身份、ai:scene:test、ai:scene:invoke，并另验原主体范围及真实记录权限；按钮显示与直接HTTP均按这组权限处理。不能为获得测试入口自动授予业务调用权限。

### 数据对象与有权候选

以下均为GET `/system/ai/scene-data` 下接口。要求平台身份及ai:scene:query/add/edit/test任一动作；forms/fields另需lowcode:record:query，samples再需lowcode:record:list。管理动作不替代业务权限。

| GET后端路径 | 查询 | data |
| --- | --- | --- |
| `/system/ai/scene-data/catalog` | 无 | objects及inputVariables；无记录查询权时objects为空 |
| `/system/ai/scene-data/forms` | `keyword,pageNum,pageSize` | Page，记录为formId/name/schemaVersion |
| `/system/ai/scene-data/fields` | `objectKey,formId` | objectKey/formId/schemaVersion/fields；当前实际schema可读字段，排除秘密字段 |
| `/system/ai/scene-data/samples` | `objectKey,formId,keyword,pageNum,pageSize` | Page，记录为recordId/label/schemaVersion/revision；当前tenant范围 |

页码1–100000，pageSize1–100，keyword最多100字符并按字面搜索。该旧样本DTO仅以记录原schema中存在的subject最多80字符或编号作标签，不是业务投影；实际值由新增数据库记录/绑定预览返回。候选不可替代实际调用授权。

### 监控摘要的分项权限

`GET /system/ai/monitor/summary` 的方法注解为 `@aiWorkspaceAccess.canEnterMonitor()`：平台身份且拥有ai:scene:invoke、ai:request:list或ai:config:list/query/add/edit/test/enable任一真实动作。仅invoke可使用本人对话索引，调用统计仍单独授权。ai:monitor:enter仅表示导航，不单独授予统计或配置权限。

调用统计calls和未归属尝试数另需ai:request:list，否则为null；当前启用Key统计另需ai:config:list或ai:config:query，否则为null并说明CONFIG_QUERY_REQUIRED。AUDIT范围额外要求ai:request:audit；调用统计仍受日志list权限限制。OWN不展示全局“异常Key为0”，recentlyFailedKeyVersions保持null/AUDIT_REQUIRED；全局异常交集需AUDIT及日志list与配置查询权限。没有相应动作时不把未知写成0，也不扩大详情/导出权限。

新场景保存、新增和启停JSON边界为128KiB；业务提交、试运行和预览为32KiB，均仅接受application/json及identity编码。该传输上限不放宽正文32000字符、用户输入2048字符等字段约束。数据候选与监控只GET，不调用供应商；正常场景操作是合法保存直接生效，旧应用发布接口仅兼容保留。

### 身份、错误与旧版兼容

实际业务只传类型化记录引用和声明输入，身份、租户、授权和版本由服务端确定；无数据通用场景省略businessRef。HTTP400/413/415/422→Result.code202，401→311，403→309，404→204，409→201，429/500/503/504→203；成功与受理业务码200。局部字段错误仅白名单路径/固定分类，安全失败data=null，不返回SQL、供应商正文、密钥或实际字段值。响应no-store，含敏感配置/预览时private。

被场景接管的旧应用/模板写操作返回409 SCENE_MANAGED。旧映射每次保存都使用原精确模板与原应用基线compileEdited，保留legacyScopes；旧共享模板、批准范围和历史请求不被新编辑改写。技术细节见[场景与数据扩展](../development/ai-extension.md)。

## 当前源码一期新增 AI 接口

本节为工作区改造前的v0.4兼容参考，不是新界面的日常操作。以下六个 Controller 按后端 `79b4655b56621fbcdafe48eb858d312bd76eb465` 核对。表内为实际方法注解，服务端范围约束见本节说明；这些接口不属于 v1.2.0 的旧静态 API 快照。

### 身份、范围与ID

- 管理配置/应用/模板/资源要求表中平台身份与对应动作。配置部分动作兼容旧 `ai:model:*`，但activate/disable/archive仍使用各自新权限；不能把兼容列表读权限推广到启用。
- 业务提交、状态、事件和取消的方法注解仅要求认证，服务层另验真实用户/tenant、应用准入、owner和业务引用。`FRONTEND/BACKGROUND/BOTH` 是应用使用范围，`TEST` 忽略这个前后台范围但不忽略允许主体和真实记录读取权限。当前HTTP没有接收客户端servicePrincipal的接口，也没有可直接使用的后台服务身份解析器。
- 日志scope默认为 `OWN`，限定当前owner/tenant及当前允许的应用/版本；伪造其他tenantRef/subjectRef被拒绝。`AUDIT` 额外要求平台身份和 `ai:request:audit`，仍需list/query/export对应动作；审计只读元数据，不授予模型调用、业务取数或取消他人请求。
- appId/requestId/configVersion/templateId/resourceId/各versionId及Key引用按字符串处理，即使Java路径参数为long也不要在JavaScript中转Number。revision、draftRevision、schemaVersion、modelIndex和页码为整数，不能与ID互换；分页total等Long在JSON按项目序列化规则为字符串。
- 新AI响应no-store；preview及模板/资源、日志含private限制。凭据只写不回显，技术请求日志不存提示词/输入/输出正文；新对话正文另按本人/审计规则持久化。业务调用的record正文由服务端重取，不能在inputs中伪造身份或授权。

### JSON DTO与返回摘要

下表补足Controller签名中 `HttpServletRequest`、泛型与嵌套DTO的实际含义。所有revision必须来自当前读取；这些是字段合同摘要，不是可直接用于任意环境的样本数据。

| 接口族 | 请求JSON/查询 | 成功data与边界 |
| --- | --- | --- |
| 配置创建/草稿 | Create=`draft,legacyModelId`；DraftChange=`revision,name,environment,providerCode,endpointUrl,protocol,timeoutSeconds,models,keys`；ModelInput=`modelRef,modelCode,jsonObject`；KeyInput=`keyRef,label,mode,envName,apiKey` | View含id、revision、activeVersion、脱敏draft、activePairs/latestTestId等；apiKey为WRITE_ONLY，不回显 |
| 配置测试/启用 | TestStart=`revision,configVersion,confirmedCosts`；Activate=`revision,configVersion,onlyAvailable`；disable/archive=`revision` | TestRun含id/configId/configVersion/status/total/finished/pairs；Pair测试结果带安全错误和脱敏Key标签，未测/失败搭配不能准入 |
| 应用创建/草稿 | Draft=`name,purpose,entryKey,policy`；更新外层=`revision,draft` | create返回字符串appId；View含appId/ownerId/entryKey/draft/draftRevision/publishedVersionId/enabled/revision |
| 应用policy | `modelMode,models,modelFallback,template,inputNames,requirements,scope,allowedSubjects,allowedAuthorities,formId,timeoutSeconds,maxAttempts,maxConcurrent,maxTokens` | FIXED或ROUND_ROBIN；template为精确templateId/templateVersionId；一期requirements.tools必须false；maxTokens为总输出Token预算，非费用或输入Token上限 |
| 应用发布/启停/回滚 | publish=`revision,testRequestIds`；enabled=`revision,enabled`；rollback=`revision,appVersionId` | Version或当前View；测试证据需匹配草稿/精确模型版本，发布不改变在途请求；options/models只接outputFormat/streaming，不开放工具选项 |
| 应用预览 | `revision,businessRef,inputs` | PublishedPreview：绑定的精确模板版本、脱敏原文/输入/资源/最终消息及安全元数据；不生成模型请求 |
| 业务提交 | `businessRef:{type,id},inputs,idempotencyKey` | HTTP202、Result.code=200，data为Request元数据；低代码type=`lowcode.record`，id=`formId:recordId`，inputs使用声明变量（摘要要求为user_request），idempotencyKey为UUID格式；受理不等于生成成功 |
| 应用测试请求 | 提交字段再加 `revision,modelIndex`（从0开始） | 同为HTTP202 Request，kind=TEST、绑定draftRevision；普通业务kind=BUSINESS、绑定appVersionId；输入与输出不在Request元数据中 |
| 摘要入口查询 | query `formId` | Entry=`appId,appVersionId,name`，无匹配可为null；服务端按真实表单和允许主体选择，客户端不能指定任意发布应用 |
| 请求状态/取消 | 路径requestId；cancel无JSON业务参数 | Request含requestId/appId/appVersionId/draftRevision/kind/businessType/businessId/status/stage/errorCode/outputStarted/attemptCount/nullable用量及时间；id非授权凭据 |
| 请求事件 | GET events，使用同一原始JWT认证 | `text/event-stream`，不是Result JSON；短期事件暂存有界，断线/窗口过期查原请求，不能拼接新请求内容充作成功 |
| 日志 | query `scope,appId,requestId,businessId,modelRef,status,tenantRef,subjectRef,from,to,pageNum,pageSize`；from/to为ISO Instant | Page(records/total/pageNum/pageSize)、Detail(request/attempts/stages)、Statistics或受限导出列表；实际模型/Key版本和nullable用量可追踪，无正文 |
| 模板 | TemplateDefinition=`name,purpose,owner,messages,variables,resources,maxChars`；save外层=`revision,definition` | create返回字符串ID；messages分INSTRUCTION/INPUT/DATA；变量声明默认/敏感/长度策略；resources固定精确资源版本与parameters/outputs映射 |
| 模板/资源测试 | Test=`revision,appId,businessRef,inputs`，这里businessRef是字符串 `formId:recordId`，不同于应用提交的对象 | TestResult含outcome/fields/schemaVersion及脱敏preview/details；模板preview不存测试证明，test记录测试结果；资源测试不回显业务原值 |
| 资源定义/审批 | ResourceDefinition=`name,domain,owner,source,formId,fields,subjects,applications,timeoutMillis`；save外层=`revision,definition`；submit/publish=`revision`；approval=`revision,approved`；enabled=`revision,enabled` | source固定代码注册 `lowcode.record`；批准生成不可变版本，变更草稿清除当前测试/审批；版本/引用/检查返回安全元数据，不开放任意URL/SQL |

嵌套schema以 `AiApplicationPolicy`、`AiProviderRuntime.ModelBinding`、`TemplateDefinition`、`ResourceDefinition` 和 `TemplateDataService` 的records为准。应用formId非空时entryKey必须是 `lowcode.record.summary/{formId}`。配置测试、应用模型测试会真实出网，草稿保存、模板预览和日志查询不会出网。

### HTTP错误与业务码

新AI局部错误合同与旧目录中的全局Result处理分开：400/413/415/422→业务码202，401→311，403→309，404→204，409→201，429/500/503/504→203；成功/受理业务码200。错误message为固定安全分类、data为空，不把HTTP503解释成业务码503。

| 边界 | 具体HTTP规则 |
| --- | --- |
| Runtime提交/测试/预览及请求查询 | UNAUTHENTICATED401；FORBIDDEN/RESOURCE_FORBIDDEN403；NOT_FOUND404；VERSION_CONFLICT及不可用模型/Key/模板/资源409；INVALID_INPUT400；MISSING_VARIABLE/CAPABILITY_UNSUPPORTED422；RESOURCE_TIMEOUT/DEADLINE_EXCEEDED504；RATE_LIMITED429；其他503 |
| 应用管理Controller | 身份401、权限403、不存在404、版本冲突409、依赖/内部不可用503；其余AiRuntimeException422；非法参数/JSON400 |
| 配置Controller | 按配置异常的status映射；message以AI_CONFIG及安全分类开头；参数400、内容类型415、权限403、依赖错误503 |
| 模板/资源局部Advice | JSON/参数400、内容类型415、上传超限413、未登录401、权限403；ServiceException按冲突409/不存在404/依赖503/参数422；AiRuntimeException422；DB不可用503、意外异常500 |
| 日志Controller | FORBIDDEN403、NOT_FOUND404、INVALID_INPUT/绑定参数400，其余AiRuntimeException503 |

Runtime的提交、测试和preview请求仅接受application/json及identity编码，最多32KiB，边界拒绝413/415并返回追踪ID。表内错误映射描述具体Controller/Advice，实际认证过滤器仍先执行；不把管理接口错误与业务运行错误混成同一套固定HTTP状态。SSE已提交后不能改写成HTTP错误JSON；查询Request终态定位失败，不能仅看初始202。

源码补充：`ai/config/AiConfigurationDtos.java`、`ai/application/AiApplicationPolicy.java`、`AiApplicationStore.java`、`AiApplicationPreview.java`、`AiRuntimeService.java`、`AiRuntimeBoundaryFilter.java`、`AiRequestLogService.java`、`AiHttpFailures.java`，以及 `ai/template/TemplateDefinition.java`、`ResourceDefinition.java`、`TemplateDataService.java`、`TemplateResponsePolicy.java`（均位于 `system-admin/src/main/java/com/xinghuiTec/`）。

### DataResourceAdminController

源码：`system-admin/src/main/java/com/xinghuiTec/ai/template/DataResourceAdminController.java`。

| 方法 | 后端路径 | 方法注解权限 | 注解行 |
| --- | --- | --- | --- |
| GET | `/system/ai/data-resources` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:data:list')` | 15 |
| GET | `/system/ai/data-resources/sources` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:data:query')` | 17 |
| GET | `/system/ai/data-resources/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:data:query')` | 20 |
| POST | `/system/ai/data-resources` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:data:add')` | 22 |
| PUT | `/system/ai/data-resources/{id}/draft` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:data:edit')` | 24 |
| POST | `/system/ai/data-resources/{id}/test` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:data:test')` | 26 |
| POST | `/system/ai/data-resources/{id}/submit` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:data:submit')` | 28 |
| POST | `/system/ai/data-resources/{id}/approval` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:data:approve')` | 30 |
| PATCH | `/system/ai/data-resources/{id}/enabled` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:data:disable')` | 32 |
| GET | `/system/ai/data-resources/{id}/checks` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:data:query')` | 34 |
| GET | `/system/ai/data-resources/{id}/versions/{version}` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:data:query')` | 36 |
| GET | `/system/ai/data-resources/{id}/versions/{version}/references` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:data:query')` | 38 |

::: details 请求参数与返回类型（该提交源码签名）

```java
public Result<Page> page(@RequestParam(defaultValue="1") int pageNum, @RequestParam(defaultValue="20") int pageSize)
public Result<?> sources()
public Result<?> get(@PathVariable long id)
public Result<String> create(@RequestBody ResourceDefinition definition)
public Result<?> save(@PathVariable long id, @RequestBody Draft<ResourceDefinition> request)
public Result<?> test(@PathVariable long id, @RequestBody Test request)
public Result<?> submit(@PathVariable long id, @RequestBody Revision request)
public Result<?> approval(@PathVariable long id, @RequestBody Approval request)
public Result<?> enabled(@PathVariable long id, @RequestBody Enabled request)
public Result<?> checks(@PathVariable long id)
public Result<?> version(@PathVariable long id, @PathVariable long version)
public Result<?> references(@PathVariable long id, @PathVariable long version)
```

:::

### TemplateAdminController

源码：`system-admin/src/main/java/com/xinghuiTec/ai/template/TemplateAdminController.java`。

| 方法 | 后端路径 | 方法注解权限 | 注解行 |
| --- | --- | --- | --- |
| GET | `/system/ai/templates` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:template:list')` | 14 |
| GET | `/system/ai/templates/options` | `@platformAccess.isPlatformIdentity() and hasAnyAuthority('ai:template:query','ai:application:query','ai:application:add','ai:application:edit','ai:application:test')` | 16 |
| GET | `/system/ai/templates/legacy-scenes` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:template:query')` | 22 |
| GET | `/system/ai/templates/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:template:query')` | 24 |
| POST | `/system/ai/templates` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:template:add')` | 26 |
| PUT | `/system/ai/templates/{id}/draft` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:template:edit')` | 28 |
| POST | `/system/ai/templates/{id}/preview` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:template:preview')` | 30 |
| POST | `/system/ai/templates/{id}/test` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:template:test')` | 32 |
| POST | `/system/ai/templates/{id}/publish` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:template:publish')` | 34 |
| PATCH | `/system/ai/templates/{id}/enabled` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:template:disable')` | 36 |
| GET | `/system/ai/templates/{id}/versions/{version}` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:template:query')` | 38 |
| GET | `/system/ai/templates/{id}/versions/{version}/references` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:template:query')` | 40 |

::: details 请求参数与返回类型（该提交源码签名）

```java
public Result<Page> page(@RequestParam(defaultValue="1") int pageNum, @RequestParam(defaultValue="20") int pageSize)
public Result<OptionsPage> options(@RequestParam(defaultValue="1") int pageNum, @RequestParam(defaultValue="20") int pageSize, @RequestParam(required=false) String keyword, @RequestParam(required=false) String appId)
public Result<Page> legacy(@RequestParam(defaultValue="1") int pageNum, @RequestParam(defaultValue="20") int pageSize)
public Result<?> get(@PathVariable long id)
public Result<String> create(@RequestBody TemplateDefinition definition)
public Result<?> save(@PathVariable long id, @RequestBody Draft<TemplateDefinition> draft)
public Result<?> preview(@PathVariable long id, @RequestBody Test request)
public Result<?> test(@PathVariable long id, @RequestBody Test request)
public Result<?> publish(@PathVariable long id, @RequestBody Revision request)
public Result<?> enabled(@PathVariable long id, @RequestBody Enabled request)
public Result<?> version(@PathVariable long id, @PathVariable long version)
public Result<?> references(@PathVariable long id, @PathVariable long version)
```

:::

### AiApplicationAdminController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/AiApplicationAdminController.java`。

| 方法 | 后端路径 | 方法注解权限 | 注解行 |
| --- | --- | --- | --- |
| GET | `/system/ai/applications` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:application:list')` | 42 |
| GET | `/system/ai/applications/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:application:query')` | 50 |
| GET | `/system/ai/applications/{id}/health` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:application:query')` | 56 |
| GET | `/system/ai/applications/options/models` | `@platformAccess.isPlatformIdentity() and (hasAuthority('ai:application:query') or hasAuthority('ai:application:add') or hasAuthority('ai:application:edit') or hasAuthority('ai:application:test'))` | 62 |
| GET | `/system/ai/applications/options/keys` | `@platformAccess.isPlatformIdentity() and (hasAuthority('ai:application:query') or hasAuthority('ai:application:add') or hasAuthority('ai:application:edit') or hasAuthority('ai:application:test'))` | 72 |
| GET | `/system/ai/applications/{id}/test-evidence` | `@platformAccess.isPlatformIdentity() and (hasAuthority('ai:application:query') or hasAuthority('ai:application:test') or hasAuthority('ai:application:publish'))` | 87 |
| POST | `/system/ai/applications` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:application:add')` | 93 |
| PUT | `/system/ai/applications/{id}/draft` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:application:edit')` | 99 |
| POST | `/system/ai/applications/{id}/publish` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:application:publish')` | 106 |
| GET | `/system/ai/applications/{id}/versions` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:application:query')` | 112 |
| POST | `/system/ai/applications/{id}/enabled` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:application:enable')` | 118 |
| POST | `/system/ai/applications/{id}/rollback` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:application:publish')` | 125 |

::: details 请求参数与返回类型（该提交源码签名）

```java
public Result<AiApplicationStore.Page> page(@RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "20") int pageSize, @RequestParam(required = false) String search)
public Result<AiApplicationStore.View> get(@PathVariable long id)
public Result<AiApplicationService.Health> health(@PathVariable long id)
public Result<List<AiProviderRuntime.AvailableModel>> models( @RequestParam(defaultValue = "TEXT") OutputFormat outputFormat, @RequestParam(defaultValue = "true") boolean streaming)
public Result<List<AiProviderRuntime.Target>> keys(@RequestParam String modelRef, @RequestParam String configVersion)
public Result<List<AiApplicationService.EvidenceView>> testEvidence(@PathVariable long id)
public Result<String> create(@RequestBody AiApplicationStore.Draft draft)
public Result<AiApplicationStore.View> draft(@PathVariable long id, @RequestBody DraftChange change)
public Result<AiApplicationService.Version> publish(@PathVariable long id, @RequestBody Publish publish)
public Result<List<AiApplicationService.Version>> versions(@PathVariable long id)
public Result<AiApplicationStore.View> enabled(@PathVariable long id, @RequestBody Enabled enabled)
public Result<AiApplicationStore.View> rollback(@PathVariable long id, @RequestBody Rollback rollback)
```

:::

### AiConfigurationController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/AiConfigurationController.java`。

| 方法 | 后端路径 | 方法注解权限 | 注解行 |
| --- | --- | --- | --- |
| GET | `/system/ai/configurations` | `@platformAccess.isPlatformIdentity() and (hasAuthority('ai:config:list') or hasAuthority('ai:model:list'))` | 23 |
| GET | `/system/ai/configurations/{id}` | `@platformAccess.isPlatformIdentity() and (hasAuthority('ai:config:query') or hasAuthority('ai:model:query'))` | 30 |
| POST | `/system/ai/configurations` | `@platformAccess.isPlatformIdentity() and (hasAuthority('ai:config:add') or hasAuthority('ai:model:add'))` | 33 |
| PUT | `/system/ai/configurations/{id}/draft` | `@platformAccess.isPlatformIdentity() and (hasAuthority('ai:config:edit') or hasAuthority('ai:model:edit'))` | 36 |
| GET | `/system/ai/configurations/{id}/versions` | `@platformAccess.isPlatformIdentity() and (hasAuthority('ai:config:query') or hasAuthority('ai:model:query'))` | 39 |
| GET | `/system/ai/configurations/{id}/impact` | `@platformAccess.isPlatformIdentity() and (hasAuthority('ai:config:query') or hasAuthority('ai:model:query'))` | 42 |
| POST | `/system/ai/configurations/{id}/test-runs` | `@platformAccess.isPlatformIdentity() and (hasAuthority('ai:config:test') or hasAuthority('ai:model:test'))` | 45 |
| GET | `/system/ai/configurations/{id}/test-runs/{testId}` | `@platformAccess.isPlatformIdentity() and (hasAuthority('ai:config:test') or hasAuthority('ai:model:test'))` | 48 |
| POST | `/system/ai/configurations/{id}/test-runs/{testId}/cancel` | `@platformAccess.isPlatformIdentity() and (hasAuthority('ai:config:test') or hasAuthority('ai:model:test'))` | 51 |
| POST | `/system/ai/configurations/{id}/activate` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:config:enable')` | 54 |
| POST | `/system/ai/configurations/{id}/disable` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:config:enable')` | 57 |
| POST | `/system/ai/configurations/{id}/archive` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:config:archive')` | 60 |

::: details 请求参数与返回类型（该提交源码签名）

```java
public Result<Page> page(@RequestParam(defaultValue="1") int pageNum,@RequestParam(defaultValue="20") int pageSize, @RequestParam(required=false) String name,@RequestParam(required=false) String providerCode, @RequestParam(required=false) String environment,@RequestParam(required=false) String status)
public Result<View> get(@PathVariable String id)
public Result<View> create(@RequestBody Create request)
public Result<View> draft(@PathVariable String id,@RequestBody DraftChange request)
public Result<java.util.List<Version>> versions(@PathVariable String id)
public Result<?> impact(@PathVariable String id)
public Result<TestRun> test(@PathVariable String id,@RequestBody TestStart request)
public Result<TestRun> testResult(@PathVariable String id,@PathVariable String testId)
public Result<TestRun> cancel(@PathVariable String id,@PathVariable String testId)
public Result<View> activate(@PathVariable String id,@RequestBody Activate request)
public Result<View> disable(@PathVariable String id,@RequestBody Revision request)
public Result<View> archive(@PathVariable String id,@RequestBody Revision request)
```

:::

### AiRequestLogController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/AiRequestLogController.java`。

| 方法 | 后端路径 | 方法注解权限 | 注解行 |
| --- | --- | --- | --- |
| GET | `/system/ai/requests` | `hasAuthority('ai:request:list')` | 39 |
| GET | `/system/ai/requests/{id}` | `hasAuthority('ai:request:query')` | 45 |
| GET | `/system/ai/requests/statistics` | `hasAuthority('ai:request:list')` | 50 |
| GET | `/system/ai/requests/export` | `hasAuthority('ai:request:export')` | 55 |

::: details 请求参数与返回类型（该提交源码签名）

```java
public Result<AiRequestLogService.Page> list(@ModelAttribute Query query)
public Result<AiRequestLogService.Detail> detail(@PathVariable long id, @ModelAttribute Query query)
public Result<AiRequestLogService.Statistics> statistics(@ModelAttribute Query query)
public Result<List<AiRequestLogService.Row>> export(@ModelAttribute Query query)
```

:::

### AiRuntimeController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/AiRuntimeController.java`。

| 方法 | 后端路径 | 方法注解权限 | 注解行 |
| --- | --- | --- | --- |
| POST | `/system/ai/applications/{appId}/preview` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:application:test')` | 34 |
| POST | `/ai/applications/{appId}/requests` | `isAuthenticated()` | 42 |
| POST | `/system/ai/applications/{appId}/test-requests` | `@platformAccess.isPlatformIdentity() and hasAuthority('ai:application:test')` | 51 |
| GET | `/ai/applications/record-summary` | `isAuthenticated()` | 62 |
| GET | `/ai/requests/{id}` | `isAuthenticated()` | 66 |
| POST | `/ai/requests/{id}/cancel` | `isAuthenticated()` | 72 |
| GET | `/ai/requests/{id}/events` | `isAuthenticated()` | 78 |

::: details 请求参数与返回类型（该提交源码签名）

```java
public Result<com.xinghuiTec.ai.contract.AiTemplatePreviewRuntime.PublishedPreview> preview( @PathVariable long appId, HttpServletRequest request, HttpServletResponse response)
public ResponseEntity<Result<AiRequestStore.Request>> submit(@PathVariable long appId, HttpServletRequest request, HttpServletResponse response)
public ResponseEntity<Result<AiRequestStore.Request>> test(@PathVariable long appId, HttpServletRequest request, HttpServletResponse response)
public Result<AiRuntimeService.Entry> entry(@RequestParam String formId)
public Result<AiRequestStore.Request> status(@PathVariable long id, HttpServletResponse response)
public Result<AiRequestStore.Request> cancel(@PathVariable long id, HttpServletResponse response)
public SseEmitter events(@PathVariable long id, HttpServletResponse response)
```

:::
