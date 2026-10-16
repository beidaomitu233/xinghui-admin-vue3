# 低代码表单与记录

入口为 **通用能力 → 表单管理**（`/lowcode/forms`）。平台设计身份配合 `lowcode:form:list/query/add/edit/publish/remove`；填写/记录使用 `lowcode:record:list/query/add/edit/remove`。普通租户拥有记录权限可以使用已发布schema，不能修改平台设计。

## 设计、预览和发布

1. 点击“新增表单”，在“表单名称”填写“需求登记”，“表单标识”填写 `request_register`。标识是小写字母开头的稳定名称，创建后不能改。
2. 选择第一个字段，将“字段标识”设为 `subject`、“显示名称”设为“需求主题”；“字段类型”选“单行文本”，开启“必填”。点击“添加字段”，把第二项显示名称设为“补充说明”、标识设为 `description`，类型选“多行文本”。用“上移/下移”调整顺序，用“移除”删除尚未需要的字段。
3. 点击“预览填写”，空着主题点击“验证填写”，应看到必填提示；填写“改善列表筛选”，再次验证应通过。预览不会保存业务记录。
4. 关闭预览，点击“保存草稿”，再使用列表“发布”，或在设计器点击“保存并发布”并确认。列表应显示已启用和发布版本1；单独保存草稿不让填写页切换版本。

字段还可设置“字段帮助”、默认值、“列表显示”和“允许查询”；每项设置的技术字段及限制见下表和[Schema扩展](/development/lowcode-extension)。

| 类型 | 限制 |
| --- | --- |
| text / textarea | 默认200 / 5000字符，上限2000 / 5000 |
| number | 绝对值≤1e12、小数最多6位，可设min/max |
| date | 真实YYYY-MM-DD日期 |
| select / multiselect | 1–100选项，value支持0/1等非空ASCII字母数字下划线连字符；多选不支持查询条件 |
| switch | 真正boolean，false可以是有效必填值 |

最多100字段；fieldKey最长50，不能覆盖ID、tenant、creator、revision等系统字段。schema与data各最多256KiB UTF-8 JSON。当前没有字段联动、公式、附件、流程或匿名公开填写。

## 填写与管理

从表单列表打开 `/lowcode/runtime/{formId}` 填写、`/lowcode/records/{formId}` 管理。新提交带当前published schemaVersion；数据页按配置显示列和查询条件，详情/编辑使用记录原schemaVersion。停用阻止新增，历史记录仍可按权限编辑。

继续上例：点击该行“填写”，输入主题“改善列表筛选”和说明“增加状态过滤”，点击“提交记录”。页面显示“记录已保存”及编号；有列表权限时点击“数据列表”，应看到这条记录及填写版本1。点击“编辑”修改说明、保存，再刷新核对；点击“详情”只读查看，删除前确认具体记录。这个例子只在有权限且已授权的测试环境中操作，不要求创建新的业务模块。

普通租户可由管理员提供填写/数据深链，不需要表单设计列表权限。服务端runtime读取允许record五种权限任一种，填写页面仍要求add、数据列表要求list、详情要求query，编辑/删除各自授权。记录按tenant范围，不按creator限定为“仅本人”。

已有记录使用过的字段key/type不能删除或改变，包含软删除记录；允许兼容新增或修改标签/展示。发布失败时已保存草稿保留，先修复兼容性，不清空数据强行发布。record读写始终联合当前tenant、formId、recordId，不能仅凭recordId访问其他租户或表单。

## 结果与恢复

保存后重新读取确认持久化；成功提交后再选择继续填写，避免重复数据。版本冲突先保留输入再重新读取；旧schemaVersion的新建请求拒绝。记录删除需要revision；存在历史记录的表单不能删除。没有读取权限不能直调API，隐藏按钮不替代后端检查。

## v0.4 AI记录摘要（组合验收待完成）

摘要复用现有表单记录及读取权限，具体配置见[AI模板与业务摘要](/features/ai)。需先由管理员配置该表单对应的已发布应用、固定模板版本和已批准资源；模板只读取批准字段，并沿用记录原始schemaVersion。只有数据配置管理权不代表可以读取记录。

相关交互已编写，真实数据库、鉴权、供应商和SSE链路尚待组合验收，不代表当前部署已启用。组合部署后，具有记录查询权限且服务端找到可用应用时，记录行可显示“AI摘要”；静态演示不启用此入口。

用户填写摘要要求后生成，可取消、查询原请求或复制当前内容。刷新后历史正文未保存则无法恢复，连接断开不代表生成成功。完整成功结果配合记录编辑权限，可选择长度合适的text/textarea字段“填入编辑草稿”；该动作重新读取记录，不自动保存，仍须人工检查并点击保存。失败、超时或中断结果不能自动写入记录。

## 源码依据

- 前端：`apps/web-ele/src/views/lowcode/form-schema.ts`、`RuntimeFields.vue`、`forms/FormDesigner.vue`，API `apps/web-ele/src/api/lowcode/forms.ts`。
- 后端：`system-admin/src/main/java/com/xinghuiTec/lowcode/LowcodeSchema.java`、`LowcodeService.java`、`LowcodeIdentity.java`（同目录）。
- 固定三表：`system-admin/src/main/resources/db/migration/V20261012_160__lowcode_forms.sql`。
