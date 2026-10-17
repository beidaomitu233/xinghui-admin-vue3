# AI场景、数据对象与兼容扩展

新场景工作区的操作见[调用监控与提示词配置](../features/ai.md)。本页面向代码维护者，说明直接保存、静态编译和授权读取的接缝。新工作区仍待组合验收；历史一期证据见[版本页](../releases/versions.md)。增加业务对象必须修改服务端注册与授权实现。

## 场景身份与保存

管理入口为 `/system/ai/scenes`，业务调用入口为 `/ai/scenes`。服务端生成稳定sceneKey，配置保存生成真实sceneVersionId；它们与旧appId含义不同。摘要场景固定绑定表单，通用场景允许无数据对象。名称变化不会改换身份或绑定表单。

保存携带 `expectedRevision` 和 `clientMutationId`；首次旧模板转换另按详情legacy确认信息提交 `confirmedLegacyConversion:true`。未确认返回409 LEGACY_CONVERSION_CONFIRMATION_REQUIRED，保存失败或事务回滚不算已转换。服务端在事务内执行CAS、静态编译、创建不可变快照并切当前指针。同mutation同内容重放原结果，不同内容冲突。无效配置返回HTTP400及白名单字段错误，不改变旧有效配置；模型暂不可用允许合法保存并返回不可运行原因。保存不读业务记录、不调用供应商、不写成功测试证据，保持场景启停意图。

客户端约600ms合并编辑，同一场景只保留一个写请求在途，较新内容排队。只有对应内容获服务端确认才显示保存成功；迟到响应、切换场景或失败重试不能覆盖本地新输入。409应保留本地编辑，明确处理冲突。

受理时固定sceneKey、sceneVersionId、模型绑定及数据范围；在途调用不随自动保存变化。同幂等键同输入返回原请求，不创建新版本调用。SSE断线查询原请求，有界事件过期不补造正文。业务结果仍由人显式采纳到草稿并保存。

管理预览和试运行同时要求平台身份、ai:scene:test与ai:scene:invoke，真实主体/数据范围继续检查。只有管理测试权限不表示已获业务调用授权。

## 数据对象唯一接缝

共享接口为 `com.xinghuiTec.ai.contract.AiSceneDataRuntime`，实现位于 `ai/scenedata`。

| 方法 | 职责与限制 |
| --- | --- |
| `catalog` | 内置对象与输入变量；没有记录查询权时不提供取数对象 |
| `forms` / `fields` | 按真实身份读取启用发布表单与允许字段；不要求表单设计权限 |
| `samples` | 当前租户和表单内的有界记录候选；另需记录list权限 |
| `compile` | 静态语法、白名单、类型及schema元数据校验，不读业务值 |
| `render` | 按固定快照和真实上下文授权读取、单次替换，返回模型消息及安全元数据 |
| `authorize` | 不依赖user_request，仅复核当前主体、绑定记录及schema元数据，不生成正文 |

`EditorInput`包含prompt、outputInstructions和selections。调用方把场景definition中的promptText、outputRequirement映射到前两项，把dataObjects映射为Selection：摘要使用场景头固定formId，对象若提供formId须一致；GENERAL使用数据对象时由该项formId指定有权选择的表单。编译结果CompiledScene须随不可变执行版本完整持久化，不能接受客户端提交的编译结果。

`SceneContext`包含sceneKey、sceneVersion、服务端TrustedActor、类型化businessRef及requestId。HTTP身份只能从真实认证构造，不接收客户端tenant/actor/authorities。异步读取桥接经校验的SecurityContext并在finally恢复，实际账户启停及租户重新核对。

当前仅注册 `lowcode.record`，字段为实际schema与subject/summary白名单的交集，变量名为record_subject/record_summary。新增字段、internal_note、SQL、URL、Bean及脚本都不构成可执行配置。低代码表单为平台定义，现有runtime无额外表单角色ACL；本接缝沿用该授权模型，不能声称已有逐字段角色ACL。

样本候选按当前tenant、form及未删除条件查询，按subject或记录ID做字面包含搜索。subject须存在于记录原schema，最多80字符作标签；空值回退记录编号。查询不选择整行data_json或internal_note作标签，前端按文本渲染。无权限时返回拒绝，不泄露候选总数。

## 渲染与期限

运行调用实际 `LowcodeService.record`，复核tenant/form/record并按记录原schemaVersion校验字段类型。快照选择不会因表单发布新字段扩大。用户输入最长2048字符；正文和输出要求合计32000字符，渲染消息UTF-8总长度不超过64KiB。

占位符只做一次替换，引用字段必须先被选择。业务值插入USER消息，独立JSON消息保持数字、布尔及null；null插值文字为null。值内的花括号、替换语法或指令都不会继续执行，SYSTEM消息不带业务值。

读取使用有界线程池和队列，受调用绝对deadline、取消及最多10秒读取时限约束；SQL采用只读事务与Statement时限。调用方停止等待不代表驱动已即时终止SQL。重试复用受理时快照；每次尝试及SSE重连的授权复核调用authorize，不伪造输入再render。

预览调用者必须掩码业务值、用户输入和默认值，保持no-store/private，不能直接把RenderedScene作为HTTP响应或普通日志。模型执行才使用未掩码消息；日志只留固定错误分类与必要版本元数据。目录候选不代替运行授权。

## 旧模板转换与连续保存

`AiSceneLegacyTemplates.inspect`读取精确旧模板版本及真实旧Invocation，返回CONVERTIBLE或READ_ONLY、原分区消息/配置、转换差异和批准范围。查看不写配置。单编辑器转换合并为USER且保留null，须明确告知并由用户首次保存确认。truncate=true、默认值、非STRING变量、不匹配的新输入长度/必填策略、不支持资源映射均只读保留。旧user_request的required须与原文是否引用该slot一致，不把原可选输入悄悄改成必填。

业务别名仅接受元数据确认的text/textarea字段，旧变量长度上限至少覆盖相应注册类型的全部历史schema上限（text为2000、textarea为5000），且不启用截断；否则返回固定只读原因。该保守判定不通过最新schema的较短长度推断历史记录也较短。类型不支持、元数据不可用或特殊默认策略都不能宣称无损转换；原配置保持供查看。

用户明确保存可转换配置时调用 `compileEdited(originalTemplateRef, originalInvocation, editor, control)`。每次后续保存都使用同一原模板与原应用版本，不能因当前场景版本已是原生格式而切到普通compile。原旧模板和共享引用不改写，新配置生成独立快照。

CompiledScene的legacyScopes完整持久化原资源版本、应用及字段范围；允许收窄，不能扩大。移除所有数据对象可不附无关资源范围，但再加入时仍从固定原基线验证。render/authorize重新核对资源当前启停、批准人、成功测试证据、配置哈希与原主体/应用允许范围；不由场景保存自动审批。

已接管的旧template保存、发布、启停和持久化测试，与 `AiApplicationReferences.withReferenceGuard` 共用保护区，命中 `AiSceneOwnership` 后返回HTTP409/业务码201/message=SCENE_MANAGED。ownership查找须为当前读，不能由外层RR旧快照误判未接管。生产依赖缺失应关闭写入；不注册空Mock。只读预览和旧不可变版本保留。

## 保留的旧接缝

v0.4旧执行仍使用 `AiTemplateRuntime` / `AiTemplatePreviewRuntime` 的精确模板与资源版本。资源批准绑定配置哈希、成功测试证据、主体和应用范围；草稿变化不能冒充原批准。旧HTTP及JSON合同在[API目录旧版兼容参考](../reference/api-catalog.md#当前源码一期新增-ai-接口)保留，不作为新工作区操作步骤。

更早的AI02链路使用 `AiBusinessVariableResolver` 和 `AiSceneContextConverter`，按appKey注册类型化上下文。`POST /ai/scenes/{appKey}/{sceneKey}/render`只渲染已注册、已发布启用场景，不调用供应商。converter只允许白名单资源引用；认证、tenant、canRead、类型和长度检查不能省略。旧published列仅代表当时当前快照，不能补造完整历史或按名称合并进新场景。

后续数据来源应注册新服务端适配，复用真实主体、行列范围、时限取消与安全分类，并增加越权、未知字段、原schema、类型/null、注入及失效回归。Agent、MCP/Skill执行、审批写和持久会话仍未实现，不能把草案当作当前接口。
