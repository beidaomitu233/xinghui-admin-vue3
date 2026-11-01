<script lang="ts" setup>
import type { MenuForm, MenuInfo } from '#/api/system/menu';

import { ref, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenForm, z } from '#/adapter/form';
import { addMenu, getMenu, getMenuTree, updateMenu } from '#/api/system/menu';

interface ParentOption {
  children?: ParentOption[];
  label: string;
  value: string;
}
const emit = defineEmits<{ saved: [] }>();
const access = useAccessStore();
const can = (code: string) => access.accessCodes.includes(code);
const parents = ref<ParentOption[]>([]);
const parentsEditable = ref(false);
const busy = ref(false);
const error = ref('');
const parentWarning = ref('');
let baseline: MenuForm;
let ready = false;
let saved = false;
let request = 0;
function empty(parentId = '0'): MenuForm {
  return {
    parentId,
    menuName: '',
    menuType: 'M',
    orderNum: 0,
    icon: '',
    path: '',
    component: '',
    perms: '',
    visible: '0',
    status: '0',
    isFrame: 1,
  };
}
function parentOptions(nodes: MenuInfo[], excluded?: string): ParentOption[] {
  return nodes
    .filter((node) => node.menuType !== 'F' && node.menuId !== excluded)
    .map((node) => ({
      value: node.menuId,
      label: node.menuName,
      children: parentOptions(node.children ?? [], excluded),
    }));
}
const permissionRule = z
  .string()
  .max(100)
  .regex(/^([a-z][a-z0-9]*:)*[a-z][a-z0-9]*$|^$/i, '权限标识格式不正确');
const [Form, formApi] = useVbenForm({
  commonConfig: { labelWidth: 100, componentProps: { class: 'w-full' } },
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  showDefaultActions: false,
  schema: [
    {
      fieldName: 'parentId',
      label: '上级菜单',
      component: 'TreeSelect',
      defaultValue: '0',
      formItemClass: 'md:col-span-2',
      componentProps: () => ({
        data: parents.value,
        disabled: !parentsEditable.value,
        props: { label: 'label', children: 'children', value: 'value' },
        nodeKey: 'value',
        checkStrictly: true,
      }),
    },
    {
      fieldName: 'menuType',
      label: '菜单类型',
      component: 'RadioGroup',
      defaultValue: 'M',
      formItemClass: 'md:col-span-2',
      componentProps: {
        options: [
          { label: '目录', value: 'M' },
          { label: '菜单', value: 'C' },
          { label: '业务模块', value: 'G' },
          { label: '操作权限', value: 'F' },
        ],
      },
    },
    {
      fieldName: 'menuName',
      label: '菜单名称',
      component: 'Input',
      defaultValue: '',
      rules: z
        .string()
        .min(2, '菜单名称需为2至50个字符')
        .max(50, '菜单名称需为2至50个字符'),
    },
    {
      fieldName: 'orderNum',
      label: '显示顺序',
      component: 'InputNumber',
      defaultValue: 0,
      componentProps: { min: 0, max: 2_147_483_647 },
      rules: z.number().int().min(0).max(2_147_483_647),
    },
    {
      fieldName: 'path',
      label: '路由地址',
      component: 'Input',
      defaultValue: '',
      dependencies: {
        triggerFields: ['menuType'],
        if: (values) => ['C', 'M'].includes(values.menuType),
        rules: () => z.string().min(1, '请输入路由地址').max(200),
      },
    },
    {
      fieldName: 'component',
      label: '组件路径',
      component: 'Input',
      defaultValue: '',
      dependencies: {
        triggerFields: ['menuType', 'isFrame'],
        if: (values) => values.menuType === 'C',
        rules: (values) =>
          values.isFrame === 1
            ? z.string().min(1, '请输入内部页面组件路径').max(255)
            : z.string().max(255).optional(),
      },
    },
    {
      fieldName: 'perms',
      label: '权限标识',
      component: 'Input',
      defaultValue: '',
      dependencies: {
        triggerFields: ['menuType'],
        if: (values) => values.menuType !== 'M',
        rules: (values) =>
          values.menuType === 'F'
            ? permissionRule.min(1, '请输入按钮权限标识')
            : permissionRule.optional(),
      },
    },
    {
      fieldName: 'icon',
      label: '图标',
      component: 'Input',
      defaultValue: '',
      rules: z.string().max(100).optional(),
      dependencies: {
        triggerFields: ['menuType'],
        if: (values) => ['C', 'M'].includes(values.menuType),
      },
    },
    {
      fieldName: 'isFrame',
      label: '打开方式',
      component: 'RadioGroup',
      defaultValue: 1,
      componentProps: {
        options: [
          { label: '内部路由', value: 1 },
          { label: '外链', value: 0 },
        ],
      },
      dependencies: {
        triggerFields: ['menuType'],
        if: (values) => ['C', 'M'].includes(values.menuType),
      },
    },
    {
      fieldName: 'visible',
      label: '显示状态',
      component: 'RadioGroup',
      defaultValue: '0',
      componentProps: {
        options: [
          { label: '显示', value: '0' },
          { label: '隐藏', value: '1' },
        ],
      },
    },
    {
      fieldName: 'status',
      label: '菜单状态',
      component: 'RadioGroup',
      defaultValue: '0',
      componentProps: {
        options: [
          { label: '正常', value: '0' },
          { label: '停用', value: '1' },
        ],
      },
    },
  ],
});
watch(
  busy,
  (value) => formApi.setState({ commonConfig: { disabled: value } }),
  { flush: 'sync' },
);
const [Modal, modalApi] = useVbenModal({
  confirmText: '保存',
  onBeforeClose: async () => {
    if (busy.value) return false;
    if (!ready || saved) return true;
    const values = await formApi.getValues<MenuForm>();
    const current = { ...baseline, ...values };
    if (
      Object.keys(empty()).every(
        (key) =>
          JSON.stringify(current[key as keyof MenuForm]) ===
          JSON.stringify(baseline[key as keyof MenuForm]),
      )
    )
      return true;
    try {
      await ElMessageBox.confirm(
        '当前修改尚未保存，确定放弃吗？',
        '未保存的修改',
        {
          type: 'warning',
          confirmButtonText: '放弃修改',
          cancelButtonText: '继续编辑',
        },
      );
      return true;
    } catch {
      return false;
    }
  },
  onConfirm: async () => {
    if (
      busy.value ||
      !ready ||
      !can(baseline.menuId ? 'system:menu:edit' : 'system:menu:add')
    )
      return;
    busy.value = true;
    error.value = '';
    modalApi.lock();
    try {
      const validation = await formApi.validate();
      if (!validation.valid) return;
      const values = await formApi.getValues<MenuForm>();
      const payload = {
        ...baseline,
        ...values,
        menuId: baseline.menuId,
        parentId:
          parentsEditable.value && can('system:menu:list')
            ? String(values.parentId ?? '0') || '0'
            : baseline.parentId,
      };
      if (payload.menuType === 'G' || payload.menuType === 'F') {
        payload.path = '';
        payload.component = '';
        payload.isFrame = 1;
      }
      await (baseline.menuId ? updateMenu(payload) : addMenu(payload));
      saved = true;
      ElMessage.success('保存成功');
    } catch {
      error.value = '菜单保存失败，请检查输入后重试';
    } finally {
      busy.value = false;
      modalApi.unlock();
    }
    if (saved) {
      await modalApi.close();
      emit('saved');
    }
  },
  onOpenChange: async (open) => {
    const current = ++request;
    if (!open) return;
    const token = access.accessToken;
    const { id, parentId } = modalApi.getData<{
      id?: string;
      parentId?: string;
    }>();
    if (
      !can(id ? 'system:menu:edit' : 'system:menu:add') ||
      (id && !can('system:menu:query'))
    ) {
      saved = true;
      await modalApi.close();
      return;
    }
    ready = false;
    saved = false;
    busy.value = true;
    error.value = '';
    parentWarning.value = '';
    parents.value = [];
    parentsEditable.value = false;
    modalApi.setState({
      title: id ? '编辑菜单' : '新增菜单',
      loading: true,
      confirmDisabled: true,
    });
    try {
      await formApi.resetForm();
      let value = empty(parentId);
      if (id) {
        const row = await getMenu(id);
        value = {
          menuId: row.menuId,
          parentId: String(row.parentId ?? '0'),
          menuName: row.menuName,
          menuType: row.menuType,
          orderNum: row.orderNum ?? 0,
          icon: row.icon ?? '',
          path: row.path ?? '',
          component: row.component ?? '',
          perms: row.perms ?? '',
          visible: row.visible ?? '0',
          status: row.status ?? '0',
          isFrame: Number(row.isFrame) === 0 ? 0 : 1,
        };
      }
      let choices: ParentOption[] = [];
      let editable = false;
      if (can('system:menu:list')) {
        try {
          choices = parentOptions(await getMenuTree(), value.menuId);
          editable = true;
        } catch {
          parentWarning.value =
            '父级列表加载失败，保留原父级；其它字段仍可编辑。';
        }
      }
      if (current !== request || token !== access.accessToken) return;
      baseline = structuredClone(value);
      parents.value = [{ value: '0', label: '主类目', children: choices }];
      parentsEditable.value = editable;
      await formApi.setValues(value);
      ready = true;
    } catch {
      error.value = '菜单加载失败，请关闭后重试';
    } finally {
      if (current === request) {
        busy.value = false;
        modalApi.setState({ loading: false, confirmDisabled: !ready });
      }
    }
  },
});
watch(
  () =>
    JSON.stringify([
      access.accessToken,
      can('system:menu:query'),
      can('system:menu:edit'),
      can('system:menu:add'),
      can('system:menu:list'),
    ]),
  () => {
    request += 1;
    ready = false;
    saved = true;
    busy.value = false;
    parents.value = [];
    void modalApi.close();
  },
);
</script>

<template>
  <Modal class="w-full max-w-[680px]">
    <el-alert v-if="error" :title="error" type="error" show-icon class="mb-4" />
    <el-alert
      v-if="parentWarning"
      :title="parentWarning"
      type="warning"
      show-icon
      class="mb-4"
    />
    <Form />
  </Modal>
</template>
