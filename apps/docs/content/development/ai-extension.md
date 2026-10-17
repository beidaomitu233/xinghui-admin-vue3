# AI模板、受控资源与旧场景扩展

面向业务代码维护者。本页区分保留的旧场景链路与 v0.4 一期独立配置、应用、模板/资源、请求日志链路。[当前源码配对](../releases/versions.md)已完成正式CI及真实认证、授权记录取数、模板预览、应用发布、真实模型、SSE、采纳草稿并保存刷新核对的组合验收。这是当前源码的一期验收记录，不表示 v1.2.0 静态快照已包含真实AI，也不证明两个独立系统采用。Agent及插件执行尚未交付。

## 旧场景代码注册的契约

`AiBusinessVariableResolver<C>`要求appKey、contextType、variableNames、requiredAuthority、findResource、canRead、resolve。C实现BusinessContext，通常只包含资源引用。Actor来自认证状态，含userId、tenantId、authorities；Resource包含resourceId/tenantId，不携带业务正文。

调用順序是认证→注册应用/权限→启用已发布场景→声明变量在注册范围内→资源元数据→tenant与canRead→取值→类型和长度→渲染。resolve只返回所请求变量，缺值与额外值均拒绝；不能先解析敏感正文再做权限检查。

```java
package example;

import com.xinghuiTec.ai.prompt.AiBusinessVariableResolver.BusinessContext;

// 仅是上下文类型示例；不注册应用、不读取或发送业务内容。
public record DocumentContext(String resourceId) implements BusinessContext {}
```

## 旧场景HTTP converter

如果需要HTTP读取，再实现 `AiSceneContextConverter<C>`：appKey、contextType、allowedFields、requiredFields、`convert(Map<String,String>)`。与resolver的app/context类型一致，最多16白名单字段；禁止userId、tenantId、authorities、sql、url、className等输入。

请求body只能包含context对象。上下文字段是非空字符串、单值最长256，不接收嵌套任意JSON；注册表拒绝重复应用或不一致类型。下面是已注册业务应用可能使用的形状，不表示当前存在document应用：

```json
{ "context": { "resourceId": "example-resource" } }
```

## 旧场景结果与失败

`POST /ai/scenes/{appKey}/{sceneKey}/render`成功返回appKey、sceneKey、publishedRevision、字符串modelId和prompt，没有凭据；只渲染，不调用供应商。403用于业务权限/归属拒绝，404用于未注册或资源不存在，409用于场景不可用，422用于变量/输出规则，其他错误按Controller映射。

运行值最长2048，输出最长12000；变量替换是声明占位符，不执行SQL/JS/模板代码。读取业务值时需重新约束tenant/权限，防止元数据检查后资源归属变动。边界日志不记录context、values、prompt或密钥。

## v0.4 模板运行接缝

新应用调用共享 `com.xinghuiTec.ai.contract.AiTemplateRuntime`。`publishedSnapshot` 返回指定模板版本的输入变量与资源版本元数据；`validateBinding` 检查必需输入和资源准入；`renderPublished` 接收精确版本、`AiInputs`、服务端构造的 `Invocation` 和固定绝对截止时间的 `InvocationControl`，返回分区消息、精确资源版本及安全缺省/截断元数据。模板实现不选择模型、不读密钥、不调用供应商。

`Invocation.actor` 只能由服务端真实登录或已授权服务身份构造，HTTP测试接口不接收Actor。首个业务引用为 `BusinessRef("lowcode.record", "formId:recordId")`，两个ID都须严格正整数字符串。资源适配会核对获批主体/应用、业务读取权限、当前账户及租户，再调用 `LowcodeService.record`；不会信任前端记录正文，也不会用配置管理权限替代业务权限。异步读取在受限线程池中桥接经过校验的身份，并在 finally 恢复线程原有安全上下文。

应用草稿准入测试的内部 `appVersionId` 可为 `draft:<revision>`，并不代表数据库发布ID；C不解析该标签，也不因此放宽资源权限。生产应用必须传真实发布版本。模型重试应复用一次渲染得到的消息，避免同一请求重复读取业务数据。

读取等待受资源时限及请求剩余deadline共同限制，每50ms检查取消；超时/取消会取消读取任务。工作线程设置只读事务超时，JdbcTemplate将剩余事务超时应用到Statement，精度为秒；调用方等待精度为毫秒。

在MySQL 8.0.12、Connector/J 8.0.33、资源时限1000ms的专用测试中，写锁保持期间：资源超时约1018ms返回，数据库SELECT约1024ms终止；取消约65ms返回CANCELLED，但SELECT约1031ms才终止。返回时语句仍在执行，随后由Statement超时终止。这次实测证明等待有界及该驱动下的超时保护，不证明线程中断能即时取消数据库语句，也不是其他部署的延迟承诺。它没有验证完整HTTP取消、模型上游取消或完整服务重启。

发布/启停通过 B 实现的 `AiApplicationReferences.withReferenceGuard` 共享数据库锁，检查与变更位于同一事务保护中。依赖状态使用当前加锁读取，避免MySQL RR旧快照。引用服务缺失时明确拒绝变更，不能注册空生产Mock。版本不可变，不提供物理删除；资源草稿修改清除当前草稿测试/审批状态，已发布快照保留，紧急停用阻止后续使用。

旧resolver和HTTP converter继续服务旧场景；新资源来源必须通过服务端代码注册，不能把请求参数当作URL/SQL/Bean/Class入口。增加业务来源时，应实现相同的身份复核、行列范围、期限取消和安全结果分类，并增加越权、超时和注入测试。

### 应用绑定版本的管理预览

`AiTemplatePreviewRuntime.previewPublished` 复用 `AiTemplateRuntime.RenderRequest` 与 `InvocationControl`，返回 `PublishedPreview`：精确 `version`、`originalMessages`、`renderedMessages`、`inputSummary`、`resourceSummary`、`notices`。消息沿用 `AiMessage`，summary为声明名到固定安全分类的映射；整个结果及消息对象的toString脱敏。原有 `AiTemplateRuntime` 签名不变。

实现复用精确发布版本读取及资源权限路径，每个资源只在本次预览中取数一次。原文保留该版本的占位符，最终消息将所有解析值掩码，包括未标为敏感的输入和默认值；摘要不包含默认值、业务值或用户输入。当前草稿更新不会改变精确历史版本预览，资源停用/无权仍会拒绝，期限和取消仍生效。它不选择供应商、不写请求/attempt或成功模型测试标记。

已实现 `POST /system/ai/applications/{appId}/preview` 接收当前草稿 `revision,businessRef,inputs`，由应用服务先核对真实Actor、管理TEST主体范围及草稿绑定版本，再构造内部Invocation调用预览；前端不能另指定模板版本或身份。应用接口负责no-store/private且不使用通用@Log。它不因具有application:test就允许读取任意模板正文；模板层不查询应用表。原 `/system/ai/templates/{id}/preview` 仍是模板管理员的当前草稿预览。应用侧HTTP/UI及精确发布版本预览已通过组合验收；该只读预览仍不替代成功模型测试。

### 模板选项HTTP边界

应用管理通过 `GET /system/ai/templates/options` 读取候选项，参数为 `pageNum`、`pageSize`、可选 `keyword` 和 `appId`。分页为 `records,total,pageNum,pageSize`，total及所有long ID均为字符串。appId若提供须为严格正十进制ID，不是认证身份。keyword按已发布版本名称做字面包含匹配，不搜索草稿或消息正文。

每条记录仅含 `templateId`、`templateVersionId`、`versionNumber`、该版本 `name`、`inputVariables`、`resources`、`available`、`unavailableReasons`。输入变量只暴露name/type/required/hasDefault，不重复资源输出变量，不含默认值；资源只暴露精确ID。历史版本仍可显式选择，禁止客户端自行选“最大ID”来替换既有绑定。

权限为平台身份配合 `ai:template:query` 或 `ai:application:query/add/edit/test` 任一动作。应用权限只授予安全候选元数据，不授予模板草稿、正文或编辑能力。available检查模板当前启停、精确资源批准证据、资源启停与可选appId范围；调用方仍须在测试、发布和运行时调用真实runtime校验主体与业务资源，不复制模板表查询。

### 资源审批与兼容数据

资源配置包含固定代码来源、表单范围、批准字段、允许主体/应用和时限。成功测试证据绑定配置哈希及参数/应用/身份/租户/权限范围哈希，批准版本关联确切测试记录。保存新草稿会清除当前草稿的测试/审批状态，不能沿用旧批准发布新配置；已有不可变版本保留，紧急停用阻止后续请求。

`GET /system/ai/templates/legacy-scenes` 只读提供旧sceneId、appKey/sceneKey、关联模型及当前publishedRevision，标记 `compatibilityOnly=true`、`templateVersionId=null`。旧同一行published列只代表当前快照，不能补造不可变历史，不自动迁移或重新绑定应用。新增 v0.4 表通过正常Flyway次序安装，不修改已应用旧迁移，也不借repair/out-of-order跳过依赖。

### 记录摘要与HTTP失败

表单记录摘要的摘要要求输入名为 `user_request`，业务引用仍为真实 `formId:recordId`；记录正文只能由授权资源读取。记录按租户+表单+记录限制，不按creator限定本人。现有低代码服务不提供额外逐字段角色ACL，资源批准字段在其读取权限之上进一步收窄。

运行交互区分受理、处理中与明确终态；SSE断开不补成成功，已有片段后不重启新模型请求。页面刷新查询原请求状态，不自动重新生成；流片段仅有界短期暂存，过期后正文不可恢复。完整成功结果可由有编辑权限的人显式填入文字字段草稿，随后仍须人工检查、保存。真实入口已验证生成、采纳草稿、保存、刷新及数据库revision变化；这不是Agent自动写入，也不扩大到未测供应商或部署环境。

v0.4 新AI接口的HTTP状态与既有Result业务码分开：成功/受理的Result.code为200；HTTP400/413/415/422对应202，401对应311，403对应309，404对应204，409对应201，429/500/503/504对应203。错误message为固定安全分类、data为空，不能把HTTP503写成业务码503。C仅为模板/资源Controller设置局部错误策略与no-store，不修改全局认证链和旧接口。

定向验证覆盖版本隔离、审批失效、跨租户/权限/应用拒绝、可选缺省、注入、固定deadline、阻塞取消等待、元数据字段排除及方法权限；专用MySQL验证实际LowcodeService/引用锁和外层RR旧快照下停用后当前读取拒绝。组合验收另覆盖真实认证、供应商和浏览器链路，不能仅靠定向测试得出同样结论。线程中断未使本次驱动的阻塞SQL即时终止，仍依靠语句时限收敛。模板/资源对象与渲染结果禁止自动日志/toString泄露，测试样本、消息正文和密钥不进入默认审计。

## 一期HTTP与后续扩展边界

当前实现的配置、应用、模板、资源、运行与日志接口、真实方法权限及DTO见[API目录的当前源码一期增量](../reference/api-catalog.md#当前源码一期新增-ai-接口)。管理接口和业务运行接口不能互换：应用TEST/preview可忽略前后台使用范围，但仍检查真实主体与业务取数权限；业务submit检查FRONTEND/BACKGROUND/BOTH及允许主体。当前HTTP只从真实登录用户构造身份，尚无可直接复用的后台服务身份解析器。

日志OWN限定当前owner/tenant及当前允许应用；AUDIT额外要求平台身份和 `ai:request:audit`，只提供元数据，不授予业务调用、取消别人的请求或读取正文。查询、导出、刷新均不重发模型请求。

一期 `AiMessage` 只有SYSTEM/USER/ASSISTANT文本角色，应用完整性检查拒绝tools。Agent工具消息、MCP、Skill、审批写与持久会话仍属未实现的后续范围，草案路径不能作为当前API使用。

## 源码依据与验证（旧场景）

验证未注册应用、重复注册、未登录、动作缺失、跨tenant、资源拒绝、缺值/多值、类型、超长及异常脱敏。接口文件位于 `system-admin/src/main/java/com/xinghuiTec/ai/prompt/AiBusinessVariableResolver.java`、`AiSceneContextConverter.java`；实现边界为 `AiBusinessPromptRenderer.java`、`AiSceneReadService.java`；HTTP映射在 `system-admin/src/main/java/com/xinghuiTec/controller/AiSceneReadController.java`。
