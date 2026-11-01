<script lang="ts" setup>
import type { VbenFormSchema } from '#/adapter/form';
import type { DictItem, DictType } from '#/api/system/dict';

import { nextTick, ref, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenForm, z } from '#/adapter/form';
import {
  createDictItem,
  createDictType,
  updateDictItem,
  updateDictType,
} from '#/api/system/dict';

type TypeValues = Omit<DictType, 'id' | 'revision'>;
type ItemValues = Omit<DictItem, 'id' | 'typeId'>;
type DialogData =
  | { kind: 'item'; row?: DictItem; typeId: DictType['id']; typeName: string }
  | { kind: 'type'; row?: DictType };
const emit = defineEmits<{ saved: [typeId?: DictType['id']] }>();
const access = useAccessStore();
const can = (code: string) => access.accessCodes.includes(code);
const error = ref('');
const busy = ref(false);
let data: DialogData;
let baseline: Record<string, unknown> = {};
let ready = false;
let saved = false;
let request = 0;
function schemas(value: DialogData): VbenFormSchema[] {
  const shared: VbenFormSchema[] = [
    {
      fieldName: 'enabled',
      label: '启用',
      component: 'Switch',
      defaultValue: true,
    },
    {
      fieldName: 'remark',
      label: '备注',
      component: 'Input',
      defaultValue: '',
      componentProps: { type: 'textarea', maxlength: 500, rows: 3 },
      rules: z.string().max(500).optional(),
    },
  ];
  if (value.kind === 'type')
    return [
      {
        fieldName: 'code',
        label: '类型编码',
        component: 'Input',
        defaultValue: '',
        componentProps: {
          disabled: !!value.row,
          placeholder: '小写字母、数字、下划线',
        },
        rules: z
          .string()
          .regex(/^[a-z][a-z0-9_]{0,63}$/, '编码须以小写字母开头，最多64位'),
      },
      {
        fieldName: 'name',
        label: '类型名称',
        component: 'Input',
        defaultValue: '',
        rules: z.string().trim().min(1, '请输入类型名称').max(100),
      },
      ...shared,
    ];
  return [
    {
      fieldName: 'value',
      label: '条目值',
      component: 'Input',
      defaultValue: '',
      componentProps: { disabled: !!value.row },
      rules: z
        .string()
        .regex(
          /^[\w.:-]{1,128}$/,
          '条目值仅支持字母、数字和 . _ : -，最多128位',
        ),
    },
    {
      fieldName: 'label',
      label: '显示名',
      component: 'Input',
      defaultValue: '',
      rules: z.string().trim().min(1, '请输入显示名').max(128),
    },
    {
      fieldName: 'sortOrder',
      label: '排序',
      component: 'InputNumber',
      defaultValue: 0,
      componentProps: { min: 0, max: 2_147_483_647 },
      rules: z.number().int().min(0).max(2_147_483_647),
    },
    ...shared,
  ];
}
const [Form, formApi] = useVbenForm({
  commonConfig: { labelWidth: 90, componentProps: { class: 'w-full' } },
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1',
  schema: schemas({ kind: 'type' }),
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
    const values = await formApi.getValues();
    if (
      Object.keys(baseline).every(
        (key) =>
          JSON.stringify(values[key] ?? baseline[key]) ===
          JSON.stringify(baseline[key]),
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
      !ready ||
      busy.value ||
      !can(`system:dict:${data.kind}:${data.row ? 'edit' : 'add'}`)
    )
      return;
    busy.value = true;
    error.value = '';
    modalApi.lock();
    let typeId: DictType['id'] | undefined;
    try {
      const validation = await formApi.validate();
      if (!validation.valid) return;
      if (data.kind === 'type') {
        const values = await formApi.getValues<TypeValues>();
        if (data.row) {
          await updateDictType(data.row.id, {
            name: values.name,
            enabled: values.enabled,
            remark: values.remark,
          });
          typeId = data.row.id;
        } else
          typeId = await createDictType({
            code: values.code,
            name: values.name,
            enabled: values.enabled,
            remark: values.remark,
          });
      } else {
        const values = await formApi.getValues<ItemValues>();
        const changes = {
          label: values.label,
          sortOrder: values.sortOrder,
          enabled: values.enabled,
          remark: values.remark,
        };
        await (data.row
          ? updateDictItem(data.row.id, changes)
          : createDictItem(data.typeId, { ...changes, value: values.value }));
        typeId = data.typeId;
      }
      saved = true;
      ElMessage.success('字典已保存');
    } catch {
      error.value = '保存失败，请检查编码、值和显示名后重试';
    } finally {
      busy.value = false;
      modalApi.unlock();
    }
    if (saved) {
      await modalApi.close();
      emit('saved', typeId);
    }
  },
  onOpenChange: async (open) => {
    const current = ++request;
    if (!open) return;
    const token = access.accessToken;
    data = modalApi.getData<DialogData>();
    if (!can(`system:dict:${data.kind}:${data.row ? 'edit' : 'add'}`)) {
      saved = true;
      await modalApi.close();
      return;
    }
    ready = false;
    saved = false;
    busy.value = true;
    error.value = '';
    modalApi.setState({
      title: `${data.row ? '编辑' : '新增'}字典${data.kind === 'type' ? '类型' : '条目'}`,
      description:
        data.kind === 'item'
          ? `所属类型：${data.typeName}；条目值创建后不可修改。`
          : '类型编码创建后不可修改。',
      loading: true,
      confirmDisabled: true,
    });
    try {
      formApi.setState({ schema: schemas(data) });
      await nextTick();
      await formApi.resetForm();
      const row = data.row;
      const value =
        data.kind === 'type'
          ? {
              code: (row as DictType | undefined)?.code ?? '',
              name: (row as DictType | undefined)?.name ?? '',
              enabled: row?.enabled ?? true,
              remark: row?.remark ?? '',
            }
          : {
              value: (row as DictItem | undefined)?.value ?? '',
              label: (row as DictItem | undefined)?.label ?? '',
              sortOrder: (row as DictItem | undefined)?.sortOrder ?? 0,
              enabled: row?.enabled ?? true,
              remark: row?.remark ?? '',
            };
      if (current !== request || token !== access.accessToken) return;
      baseline = structuredClone(value);
      await formApi.setValues(value);
      ready = true;
    } catch {
      error.value = '字典表单加载失败，请关闭后重试';
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
      ...['type:add', 'type:edit', 'item:add', 'item:edit'].map((action) =>
        can(`system:dict:${action}`),
      ),
    ]),
  () => {
    request += 1;
    ready = false;
    saved = true;
    busy.value = false;
    void modalApi.close();
  },
);
</script>

<template>
  <Modal class="w-full max-w-[480px]">
    <el-alert v-if="error" :title="error" type="error" show-icon class="mb-4" />
    <Form />
  </Modal>
</template>
