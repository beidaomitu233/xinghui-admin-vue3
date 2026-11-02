# 分页列表

使用 `#/adapter/vxe-table` 的 `useVbenVxeGrid`。配置列、查询函数、分页与工具栏，优先启用表头排序。

```ts
const [Grid, gridApi] = useVbenVxeGrid({
  gridOptions: {
    columns: [{ field: 'name', title: '名称', sortable: true }],
    proxyConfig: { ajax: { query: loadPage } },
    toolbarConfig: { refresh: true, custom: true },
  },
});
```

`loadPage` 返回 `items` 与 `total`。服务端分页排序在查询前执行，表头排序参数由 `createVbenGridQuery` 读取。

业务按钮在背景工具栏上；展开筛选后独立显示筛选区；表格、空状态与分页保持一致边距。示例：`views/system/user/index.vue`。
