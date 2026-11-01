# 字典选择

业务页面通过 `useDictionary` 读取字典选项与显示名，避免在页面中硬编码状态文本。

```ts
const status = useDictionary('job_status');
```

选项用于 Select，`label(value)` 用于表格显示；列表加载完成后用 `ensureLabels` 补齐历史值。编辑字典类型与条目见 [字典管理](../features/dictionary.md)。
