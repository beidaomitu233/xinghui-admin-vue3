# 编辑与详情

编辑使用 `useVbenModal` 配合 `useVbenForm`，通过 `modalApi.setData(...).open()` 传入记录身份。打开时读取详情，保存成功后通知列表刷新。

长表单或工具配置使用 Element Drawer。角色权限等需要大空间的内容使用宽弹窗和可滚动内容区。

只读详情复用数据展示，不把编辑字段全量禁用作为默认详情样式。
