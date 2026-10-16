# 字典管理与业务读取

入口为 **系统管理 → 字典管理**。字典把稳定值转换为显示标签，例如公告类型、任务状态；业务保存 value，页面展示 label。修改标签不应改写既有业务值。

## 身份与前置

管理需要平台身份及 `system:dict:list`，新增/编辑类型与条目分别使用 `system:dict:type:add/edit`、`system:dict:item:add/edit`。业务读取 `/dict/...` 不是管理列表，不向普通读取者开放全部配置。

## 操作步骤

1. 点击“新增类型”，在“类型编码”填写中性编码 `example_priority`、“类型名称”填写“示例优先级”，开启“启用”并保存。
2. 选中该类型，点击“新增条目”，在“条目值”填写 `normal`、“显示名”填写“普通”、“排序”填写10，保持启用并保存。类型编码和条目值创建后保持稳定。
3. 调整显示名称和排序后保存，重新读取条目确认顺序。
4. 停用条目后，业务下拉中不再提供新的选择；历史记录仍通过标签查询显示，不能因此显示成空白。

上例完成后，类型列表应出现“示例优先级”，选中后条目表显示稳定值normal和显示名“普通”。示例字典不会自动接入任何业务页；业务开发者仍需按code读取。

管理 API 返回 `DictType[]`、`DictItem[]`，不是通用分页。业务选项响应为 `{ value, label, sortOrder }[]`；标签响应包含 `known`、`enabled`，可区分未知值与已停用的历史值。

```ts
import { getDictLabel, getDictOptions } from '#/api/system/dict';

async function readNoticeTypes(historicalValue: string) {
  const options = await getDictOptions('notice_type');
  const historical = await getDictLabel('notice_type', historicalValue);
  return { options, historical };
}
```

## 正常结果与恢复

新选择使用启用条目；历史 label 仍可读。服务不可用时业务页面使用原始 value 回退，并提供重试，不自动把 value 改成 label。重复 code/value、无效字段或权限不足会拒绝保存；先检查对应类型，再修改条目。当前 API 未提供类型/条目删除动作，不编造删除教程。

## 源码依据

- 前端：`apps/web-ele/src/api/system/dict.ts`、`apps/web-ele/src/composables/use-dictionary.ts`。
- 后端：`system-admin/src/main/java/com/xinghuiTec/controller/DictionaryAdminController.java`、`DictionaryReadController.java`、`service/DictionaryService.java`（后两者与第一个相同包根 `com/xinghuiTec` 下定位）。
- 组件接入见[字典选择](/components/dictionary-select)。
