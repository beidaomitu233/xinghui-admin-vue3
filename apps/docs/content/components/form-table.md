# Vben Form、VXE、Modal与Drawer适配

这些封装供开发者构建复杂页面，须使用本项目本地版本。当前业务页同时存在Element Plus表单/表格；静态示例不是现有业务API成功证明，也不要求把所有页面重写为统一封装。

## Schema Form

从 `#/adapter/form`导入useVbenForm、z和VbenFormSchema。字段Schema使用fieldName、label、component、componentProps及rules；component必须存在于本地组件映射。配置如commonConfig、layout、schema、handleSubmit来自本地useForm。

```vue
<script setup lang="ts">
import { useVbenForm } from '#/adapter/form';

const [Form, formApi] = useVbenForm({
  schema: [
    {
      fieldName: 'title',
      label: '标题',
      component: 'Input',
      rules: 'required',
    },
  ],
  handleSubmit: async () => {
    /* 在这里接入真实API；本示例不写库。 */
  },
});
async function reset() {
  await formApi.resetForm();
}
</script>
<template><Form /><el-button @click="reset">重置</el-button></template>
```

formApi提供getValues、setValues、resetForm、validate、submitForm等方法；validate结果包含valid，不当作boolean本身。适配中Upload使用fileList模型属性、CheckboxGroup使用model-value；required/selectRequired的空值规则不同。

## VXE表格

从 `#/adapter/vxe-table`导入useVbenVxeGrid和类型，返回 `[Grid, gridApi]`。适配默认proxy结果字段为items、total；本项目很多业务响应为records，必须显式映射，不能直接套用。全局关闭VXE自身formConfig，筛选使用formOptions。

```ts
import { useVbenVxeGrid } from '#/adapter/vxe-table';

const [Grid] = useVbenVxeGrid({
  gridOptions: {
    columns: [{ field: 'title', title: '标题' }],
    data: [{ title: '静态展示示例' }],
    proxyConfig: { enabled: false },
    pagerConfig: { enabled: false },
  },
});
void Grid;
```

本地renderer注册CellImage、CellLink；CellImage传入src/previewSrcList，CellLink按props.text显示。外部链接、图片URL仍需业务校验，renderer不是访问控制器。

## 弹窗与抽屉

`useVbenModal(options)` / `useVbenDrawer(options)`从 `@vben/common-ui`导入，返回组件与api。options支持title、onConfirm、onOpenChange及connectedComponent等；api有open、close、setData、getData、setState。connectedComponent用于子组件共享API，不在父页再造一个不同状态对象。

```ts
import { useVbenDrawer, useVbenModal } from '@vben/common-ui';

const [Modal, modalApi] = useVbenModal({ title: '详情' });
const [Drawer, drawerApi] = useVbenDrawer({ title: '编辑' });
modalApi.setData({ mode: 'view' });
drawerApi.setData({ mode: 'edit' });
void [Modal, Drawer];
```

读详情成功再open；保存失败保持容器打开，明确解锁loading/submitting。容器API本身不执行权限校验、不自动保存，也不自动提供业务未保存确认；使用本地编辑状态工具补齐这些行为。

## 源码依据

`apps/web-ele/src/adapter/form.ts`、`adapter/vxe-table.ts`、`views/demos/form/basic.vue`；`packages/@core/ui-kit/form-ui/src/form-api.ts`；`packages/@core/ui-kit/popup-ui/src/modal/use-modal.ts`、`drawer/use-drawer.ts`。阅读[编辑详情工具](/components/edit-detail)后再接真实API。
