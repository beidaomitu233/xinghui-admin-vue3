# Vben Form、VXE、Modal与Drawer适配

Vben原生Form、Grid、Modal和Drawer是新增及改造管理页的默认选型。当前正分范围迁移旧页面；使用本地实际版本，组件优先级和页面结构见[选型总览](/components/overview)。不要再以“高级封装”为理由让普通业务页重新手写通用表格/弹层。

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

当前版本的字段联动需要非空 `dependencies.triggerFields`；空数组会直接跳过 `if`、`disabled` 等联动判断。仅按详情/编辑模式隐藏字段时，可用已有 Schema 的 `hide` 属性并通过 `updateSchema` 更新，不必新增联动机制。详情不展示密码输入框；可选字段的规则和必填标记也应一致，不能仅因为有格式校验就展示红星。

## VXE表格

从 `#/adapter/vxe-table` 导入 `useVbenVxeGrid` 和类型，返回 `[Grid, gridApi]`。裸 `gridOptions` 类型为 `VxeTableGridOptions<Row>`，外层 `VxeGridProps` 包含 `gridOptions`、`formOptions` 和 `gridEvents`。适配默认 proxy 结果字段为 `items`、`total`；本项目很多业务响应为 `records`，必须显式映射，不能直接套用。全局关闭 VXE 自身 `formConfig`，筛选使用 `formOptions`。

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

打开后在onOpenChange取真实详情，用原生loading呈现准备状态；保存失败保持容器打开并解锁。容器不执行后端鉴权或自动保存，未保存确认放onBeforeClose与成熟确认组件；业务代码处理这些边界，不再另造通用编辑状态壳。

## 源码依据

`apps/web-ele/src/adapter/form.ts`、`adapter/vxe-table.ts`、`views/demos/form/basic.vue`；`packages/@core/ui-kit/form-ui/src/form-api.ts`；`packages/@core/ui-kit/popup-ui/src/modal/use-modal.ts`、`drawer/use-drawer.ts`。阅读[编辑详情工具](/components/edit-detail)后再接真实API。
