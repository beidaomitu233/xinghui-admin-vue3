# AI对话与数据库数据绑定扩展

本页供代码维护者接入场景数据绑定。操作流程见[AI对话与数据库引用](../features/ai.md)。本轮配置、数据预览、引用保存和对话阅读已原生验证；真实供应商限制、旧一期结果与当前源码配对在[版本页](../releases/versions.md)分别记录。

## 场景保存与对话运行

场景由服务端生成稳定sceneKey，合法保存携带expectedRevision/clientMutationId，事务内静态编译、生成不可变sceneVersion并切当前指针。无效定义不切旧有效版本；模型暂不可用不阻止合法保存，保存不调用模型或读取样本。客户端只在对应内容获服务端确认后显示已保存，409保留本地编辑。

新Definition增加dataBindings，使用下面C接缝的DataBinding列表。旧dataObjects保留兼容，新的数据库绑定不与旧Selection混在同一编译输入中。历史outputRequirement非空时，场景服务将其无损合并到promptText后返回编辑；新保存使用单一正文和空outputInstructions。

新运行通过 `/ai/conversations` 创建对话或向既有会话追加消息。会话与消息正文真实持久化，续聊只允许本人及原租户/场景/业务来源；同一会话单轮在途。仅成对成功轮次参与后续模型上下文，失败或部分输出保留真实状态。历史上下文截断有安全元数据，旧无正文记录不补造。

每次受理固定场景版本、模型与取数定义；在途不随保存变化。同mutation同内容重放原结果，不重复消息或供应商调用。SSE重连和每次尝试重新核对当前授权，不能用可读旧会话替代当前业务读取权。审计查看他人对话不授予续聊权。

## 多 Key 配置与运行切换

独立AI配置页对应`/ai/configurations`，普通管理使用`/system/ai/settings`，不让使用者填写配置版本或Key配对ID。AiSettingsDtos.Change增加keys及可选clientMutationId；keys是完整目标集合，KeyChange使用keyId/name/apiKey/modelCodes，keyId只在本配置内映射。Key与模型关联实际保存在不可变快照中，运行不能退回所有Key与所有模型的任意组合。上限为每渠道16个Key、16个模型、64组关联。

新增Key需明文材料，已有Key留空保留；keys省略兼容原单Key请求，多Key时顶层apiKey不允许含糊替换首项。Change、KeyChange的apiKey为WRITE_ONLY且toString脱敏。普通View.keys及TestRun.keys提供每Key/每模型的安全结果，原models保持聚合；同模型任一明确关联Key通过即可用，不能把某Key的成功转算给另一个Key。

设置保存可传规范UUID clientMutationId，在主体/租户范围防止结果未知时重复创建；同内容重放返回当前可读配置，内容改变409。只修改名称不产生新连接测试；更换Key或模型保留原active，pendingChanges明确新内容待测。当前使用的模型必须有合法验证关联才能维护执行指针，受限旧场景无法安全维护时保留原连接并给出原因。

`AiProviderPresets`是设置、聊天适配器与扫描共同的官方地址白名单。Preset提供code/name/chatEndpoint/modelsEndpoint/publicModelsEndpoint/suggestedModels，require(code,chatEndpoint)核对完全相同的官方地址；当前只有OpenRouter和DeepSeek，不接受任意兼容URL或以建议模型代替实时目录。

AiConfiguredProviderRuntime只提供仍启用、关联匹配且证明有效的目标；失效Key材料不会被后续候选重新取回。AiRequestExecutor按场景允许的模型/渠道顺序，先消耗当前模型合格Key，再尝试下一候选。预算依据实际剩余目标数分配，总maxAttempts、deadline和token不因切换重置；仅一个目标时不预留不存在的备用份额。网络错误、408/504、429及可重试供应商错误在没有输出时可继续；实际取消、授权/内容拒绝及非重试错误终止。

一旦流已输出，失败结果保留INCOMPLETE/partial，输出触达标志阻止切换与拼接另一模型正文；取消保留真实已收内容。只有完整成功轮次参与后续对话上下文。日志尝试记录实际服务商、模型及Key版本，不存明文凭据，也不将失败用量未知计为0。跨服务商备用需要场景确实选择该独立渠道，多个同OpenRouter Key并不解决其入口整体故障。

## 模型发现与凭据边界

`AiModelCatalogService`与配置同包，保存Key扫描复用AiConfigurationService.head/snapshot/resolveSecret：限定当前已保存草稿的configId/keyId成员，取Key前后和返回前核对revision。公开HTTP不接受keyVersion、密文、ENV名或任意URL；不会另建凭据库或改变启用状态。

首次配置可走POST `/system/ai/model-catalog/draft-scan`，输入provider/apiKey后先扫描再选模型，避免保存必须先有模型的循环。DraftScan.apiKey为WRITE_ONLY、toString为REDACTED，原始JSON有16KiB、深度、未知/重复字段和尾随内容限制；明文仅本次内存使用，不进入默认操作日志、数据库、浏览器持久化或响应。仅有add/edit/test动作可草稿扫描，不因此取得配置query权限；已保存Key扫描独立要求test。

AiModelCatalogTransport只对共享预设发GET，区分OpenRouter公共/models和认证/models/user、DeepSeek认证/models，后两者都不发推理请求。生产固定HTTPS、公网地址检查、禁止重定向，并复用运维代理配置；本地测试接缝只允许127.0.0.1随机端口，不注册生产mock。请求总限时15秒，响应4MiB、最多5000模型、并发4及有界DNS队列。

响应仅白名单可读名称、代码、上下文/输出上限、模态及声明参数；搜索分页在本次有界目录内完成，不混用其他Key缓存。source/refreshedAt明确目录来源与时间，generationVerified始终false。OpenRouter用户目录仅按服务端用户偏好/隐私/防护规则过滤，不证明余额和实际调用可用；DeepSeek可选元数据缺失时保留未知。上游401/403转为502加固定安全分类，避免触发本系统重新登录；原始错误、Key和异常原因不出响应。精确DTO、权限和错误见[模型扫描HTTP](../reference/api-catalog.md#模型目录与-key-扫描)。

目录允许逐条兼容演进：不符合实际配置/执行code规则的`~`等路由别名、显式非text输出、无效元数据及重复code过滤并报告scannedCount/filteredCount/filterReasons，不让单条新ID使全部聊天模型不可用。total仍按过滤后的搜索匹配计算；不因扫描放行而扩展执行端别名支持。严格JSON、控制字符、秘密回显和有界响应仍整体失败关闭。

## 数据目录与唯一共享接口

`com.xinghuiTec.ai.contract.AiSceneDataRuntime`由SceneDataService实现，DatabaseBindingReader负责动态元数据与只读查询。目录来自当前应用数据库JDBC DatabaseMetaData，显示真实表/字段名、备注及类型；通用业务表无需逐表编写注册代码。

| 方法 | 数据与限制 |
| --- | --- |
| tables / databaseFields | 当前实际表、字段与可读主键；按权限过滤，秘密列不作输出 |
| relations | 实际单列FK关系；复合FK不伪装为单列完整关系 |
| records | 有界真实行候选，返回精确key、业务名称label、实际values及可提交businessRef |
| compile | 静态语法、标识符、字段、模式和关系校验，不读取样本值 |
| previewBindings | 真实授权取数，返回values、reads条数/截断与notices，不调用模型 |
| render / authorize | 固定快照实际渲染／仅复核当前授权与行/schema元数据 |

sourceKey为 `db.<实际表名>` 或 `lowcode.<表单ID>`；它们由选择器提供。低代码虚拟来源识别所有实际可读业务字段，按记录原schema校验类型及读取，不再以两个字段名注册白名单。

候选label优先可读name/title/subject，再取首个非主键、非租户/软删且非秘密的非空字符串业务值；没有名称时回退精确主键，最长80个Unicode码点。不硬编码某张表的名称列，key始终保持原精度字符串，不将显示名称当作执行引用。

## 绑定定义与主子查询

EditorInput增加bindings，CompiledScene增加BindingSnapshot列表；旧构造器与缺失JSON字段按空列表兼容。新绑定编译标识为scene-data-v2。每个快照保存完整定义、所选字段和查询依赖元数据及schemaFingerprint。依赖包括PK、过滤、租户/软删除与主子关联两侧，read/authorize在取值前共同复核存在、可读性和类型；后续新增列不扩大原全字段引用。外层服务须完整持久化，不接受客户端编译快照。

DataBinding包含variable、label、sourceKey、mode、fields、filters、limit、row、relation。mode为FIELD（单值）、ROW（对象）、TABLE或CHILDREN（数组）；空fields表示该次编译固定所有可读字段。row.currentRecord使用本次真实业务引用，固定row.key按真实主键匹配；无可读主键时不允许ROW或行候选。

CHILDREN的relation包含parentVariable、parentField、childField。parentVariable必须引用前面同组ROW绑定，字段真实存在且类型兼容。实现读取主记录真实parentField，用参数化等值条件约束子表childField，并叠加其tenant、软删及用户过滤。主键可内部用于关联而不额外暴露到用户选择的投影。主值null返回空子行数组。

过滤只支持固定比较、字面包含与null操作，最多16个AND条件；不存在任意SQL、URL、函数、Bean或表达式入口。动态标识符经实际元数据确认后引用，值使用参数。字段元数据逐行匹配TABLE_NAME及当前目录，防止下划线等JDBC模式字符混入相似表的列。

## 当前记录与身份

业务场景候选Entry提供`contextRequired`、`contextSourceKey`、`contextSourceLabel`和`canStartFromMonitor`，供前端按名称选择当前记录。选择器不可通过读取完整管理定义绕过权限；不能在监控直接创建的场景，应从提供真实记录上下文的业务入口进入。续聊沿用会话原业务引用，不由客户端更换。

低代码BusinessRef仍为 `lowcode.record / formId:recordId`；通用行候选返回 `database.record / db1.<base64url>`，解码为sourceKey及主键映射。引用只是类型化选择，不是授权令牌。执行服务须保持完整引用直到后续尝试、持久化与SSE重连；最长2048字符，不可被旧短列截断。没有当前行绑定的普通场景可沿用ai.scene关联。

HTTP不接受actor/tenant/authorities。真实身份进入有界只读事务工作线程，当前账户与tenant重新校验，并在finally恢复原SecurityContext。通用数据库目录、编译、预览与实际读取都要求平台身份和独立ai:data:database:read；无法推导权限的普通表也受此限制。低代码仍要求实际record query，集合候选另需list；已知资讯/字典表叠加原动作，租户与软删除条件不可由过滤覆盖。

认证、配置、权限、会话与系统日志等基础设施表不作为普通业务来源。密码/密钥/令牌等秘密字段按名称和备注排除；JSON及\_json结构化列递归剔除秘密键，二进制或不可安全解释的对象列不输出。普通授权业务值实际预览，不能统一掩码。

## 类型、有界读取与预览

FIELD/ROW/TABLE/CHILDREN分别保留单值/对象/数组，数字与null保留实际类型。普通文本包括花括号保持字符串，结构化字段无法安全解析时明确拒绝。单次替换允许中文与点号别名，例如 <code v-pre>{{客户.名称}}</code>；值不会再次展开或进入SYSTEM指令。

最多16绑定、64字段、每绑定200行，limit+1判断截断，不为预览扫描无界总数。读取受最多10秒、调用deadline及取消约束。选择器独立数据预览值上限256KiB，场景渲染与模型全部消息上限64KiB，历史问答也在该预算内；普通长文本读取最多8193字符并在8192截断提示，结构化JSON不能以截断原文绕过秘密过滤。停止等待不保证驱动语句即时终止。

previewBindings返回实际values、每项ReadReceipt及安全notices；低代码旧记录缺少后来新增字段时，返回null及FIELD_NOT_IN_RECORD_SCHEMA。render从固定CompiledScene一次读取，将同一投影用于USER及独立JSON消息，并以RenderedScene.bindingPreview返回实际values/reads。已保存场景预览复用这个结果，不用原Definition再次编译或取数；authorize只查询权限、行存在与schema元数据，不解析业务正文。DTO/toString和默认操作日志不输出数据正文，预览响应no-store/private。

## 旧版本兼容

旧v1编译快照、精确模板版本与AI02注册上下文链路保持可读。AiSceneLegacyTemplates每次转换保存仍使用同一原模板/原应用基线，保留legacyScopes，首次明确确认转换差异。不支持的默认值、截断、必填/长度策略只读保留；新增bindings不能借旧转换扩大批准范围。

已接管的旧模板/应用写接口返回409 SCENE_MANAGED，继续由场景CAS管理。历史输出要求合并到可编辑正文；不覆盖旧不可变版本。Agent、MCP/Skill执行及审批写仍未实现。

完整HTTP与DTO见[API目录](../reference/api-catalog.md#数据库引用与实际值预览)；对话和设置另见该页的实用改造接口。不要将旧应用发布合同当成新保存前置。
