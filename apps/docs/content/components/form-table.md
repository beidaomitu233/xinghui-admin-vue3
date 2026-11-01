# 表单与表格

业务表单使用 Vben Form Schema，复杂字段组合 Element Plus 原生组件。列表使用 VXE Table，配置列宽、排序、分页与操作列。

动态 `componentProps` 会重新提供字段属性；多选字段在动态属性中也要保留 `multiple: true`。

表单设计器处理面向他人填写的动态表单，管理页面编辑表单则使用 Vben Form。示例分别见 `views/lowcode/forms` 与 `views/system/user/user-modal.vue`。
