# API 目录

本页供集成开发者按路径定位 Controller、调用权限和请求 DTO。目录来自[版本组合](../releases/versions.md)的后端源码：32 个 Controller 类，其中30个包含 GET/POST/PUT/DELETE/PATCH映射，共147条路径（含资讯列表别名）。这是可核查的源码快照，不是运行时 Swagger，也不承诺未配置服务的接口可直接成功。

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

## ContentNewsController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/ContentNewsController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/news` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:news:list')` | `list` / 23 |
| GET | `/system/news/list` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:news:list')` | `list` / 23 |
| GET | `/system/news/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:news:query')` | `get` / 33 |
| POST | `/system/news` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:news:add')` | `create` / 39 |
| PUT | `/system/news/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:news:edit')` | `update` / 46 |
| DELETE | `/system/news/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:news:remove')` | `delete` / 54 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<ContentService.Page> list( @RequestParam(defaultValue = "1") int pageNum, @RequestParam(defaultValue = "10") int pageSize, @RequestParam(required = false) String title, @RequestParam(required = false) String status)
public Result<Map<String, Object>> get(@PathVariable String id)
public Result<String> create(@RequestBody NewsChange change)
public Result<Void> update(@PathVariable String id, @RequestBody NewsChange change)
public Result<Void> delete(@PathVariable String id)
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

## NotificationTemplateAdminController

源码：`system-admin/src/main/java/com/xinghuiTec/controller/NotificationTemplateAdminController.java`。

| 方法 | 后端路径 | 注解权限 | 方法 / 行 |
| --- | --- | --- | --- |
| GET | `/system/notification/templates` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:notificationTemplate:list')` | `list` / 36 |
| POST | `/system/notification/templates` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:notificationTemplate:add')` | `create` / 42 |
| PUT | `/system/notification/templates/{id}` | `@platformAccess.isPlatformIdentity() and hasAuthority('system:notificationTemplate:edit')` | `edit` / 49 |

::: details 请求参数与返回类型（源码签名）

```java
public Result<List<View>> list()
public Result<Long> create(@Valid @RequestBody Create request)
public Result<Void> edit(@PathVariable long id, @Valid @RequestBody Edit request)
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
