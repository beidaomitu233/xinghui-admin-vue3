<script setup lang="ts">
import type { VbenFormSchema } from '#/adapter/form';
import type { NoticeInfo } from '#/api/system/notice';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import dayjs from 'dayjs';
import { ElMessage } from 'element-plus';

import { useVbenForm, z } from '#/adapter/form';
import { addNotice, getNotice, updateNotice } from '#/api/system/notice';
import { DICT_TYPE, useDictionary } from '#/composables/use-dictionary';

const emit = defineEmits<{ success: [] }>();
const access = useAccessStore();
const dictionary = useDictionary(DICT_TYPE.NOTICE_TYPE);
const record = ref<NoticeInfo>();
const failed = ref(false);
const readOnly = ref(false);
const loaded = ref(false);
const saving = ref(false);
let generation = 0;
function schema(currentType = ''): VbenFormSchema[] {
  const options: {
    disabled?: boolean;
    label: string;
    sortOrder: number;
    value: string;
  }[] = [...dictionary.options.value];
  if (currentType && !options.some((item) => item.value === currentType))
    options.push({
      label: dictionary.label(currentType),
      value: currentType,
      disabled: true,
      sortOrder: Number.MAX_SAFE_INTEGER,
    });
  return [
    {
      fieldName: 'noticeTitle',
      component: 'Input',
      label: '公告标题',
      rules: z.string().trim().min(1, '请输入公告标题'),
      componentProps: { maxlength: 200 },
    },
    {
      fieldName: 'noticeType',
      component: 'Select',
      label: '公告类型',
      rules: 'required',
      componentProps: { options },
    },
    {
      fieldName: 'status',
      component: 'RadioGroup',
      label: '状态',
      componentProps: {
        options: [
          { label: '正常', value: '0' },
          { label: '关闭', value: '1' },
        ],
      },
    },
    {
      fieldName: 'noticeContent',
      component: 'Input',
      label: '公告内容',
      componentProps: { type: 'textarea', rows: 6 },
    },
    {
      fieldName: 'startTime',
      component: 'DatePicker',
      label: '开始时间',
      componentProps: {
        type: 'datetime',
        valueFormat: 'YYYY-MM-DD HH:mm:ss',
        clearable: true,
      },
    },
    {
      fieldName: 'endTime',
      component: 'DatePicker',
      label: '结束时间',
      componentProps: {
        type: 'datetime',
        valueFormat: 'YYYY-MM-DD HH:mm:ss',
        clearable: true,
      },
    },
    {
      fieldName: 'remark',
      component: 'Input',
      label: '备注',
      componentProps: { type: 'textarea', rows: 2 },
    },
  ];
}
const [Form, formApi] = useVbenForm({
  schema: [],
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1',
});
const [Modal, modalApi] = useVbenModal({
  title: '公告',
  onBeforeClose: () => !saving.value,
  class: 'w-[min(720px,94vw)]',
  closeOnClickModal: false,
  onOpenChange: async (opened) => {
    const run = ++generation;
    if (!opened) return;
    const data = modalApi.getData<{ id?: number; readOnly?: boolean }>();
    readOnly.value = data.readOnly === true;
    failed.value = false;
    record.value = undefined;
    loaded.value = false;
    saving.value = false;
    const title = data.id ? '编辑公告' : '新增公告';
    modalApi.setState({
      title: readOnly.value ? '公告详情' : title,
      loading: true,
      confirmDisabled: true,
      showConfirmButton: !readOnly.value,
    });
    try {
      formApi.setState({ schema: [], commonConfig: { disabled: true } });
      await formApi.resetForm({ values: {} });
      if (run !== generation) return;
      if (
        data.id !== undefined &&
        !access.accessCodes.includes('system:notice:query')
      )
        throw new Error('没有读取权限');
      await dictionary.load();
      const value =
        data.id === undefined ? undefined : await getNotice(data.id);
      if (run !== generation) return;
      record.value = value;
      const currentType = String(
        value?.noticeType ?? dictionary.options.value[0]?.value ?? '',
      );
      await dictionary.ensureLabels([currentType]);
      if (run !== generation) return;
      formApi.setState({
        schema: schema(currentType),
        commonConfig: { disabled: readOnly.value },
      });
      const values = {
        noticeTitle: value?.noticeTitle || '',
        noticeType: currentType,
        noticeContent: decodeContent(value?.noticeContent),
        status: String(value?.status ?? '0'),
        remark: value?.remark || '',
        startTime: dateValue(value?.startTime),
        endTime: dateValue(value?.endTime),
      };
      await formApi.resetForm({ values });
      if (run === generation) {
        loaded.value = true;
        modalApi.setState({ confirmDisabled: false });
      }
    } catch {
      if (run === generation) failed.value = true;
    } finally {
      if (run === generation) modalApi.setState({ loading: false });
    }
  },
  onConfirm: async () => {
    const run = generation;
    const permission = record.value
      ? 'system:notice:edit'
      : 'system:notice:add';
    if (
      saving.value ||
      !loaded.value ||
      readOnly.value ||
      !access.accessCodes.includes(permission)
    )
      return;
    const validation = await formApi.validate();
    if (!validation.valid) return;
    const values = await formApi.getValues();
    if (
      run !== generation ||
      readOnly.value ||
      !loaded.value ||
      !access.accessCodes.includes(permission)
    )
      return;
    if (saving.value) return;
    saving.value = true;
    modalApi.lock();
    failed.value = false;
    try {
      const input = {
        ...values,
        noticeId: record.value?.noticeId,
        noticeType: Number(values.noticeType),
        status: Number(values.status),
      };
      await (record.value ? updateNotice(input) : addNotice(input));
      if (run !== generation) return;
      saving.value = false;
      modalApi.unlock();
      modalApi.close();
      ElMessage.success('公告已保存');
      emit('success');
    } catch {
      if (run === generation) failed.value = true;
    } finally {
      if (run === generation) {
        saving.value = false;
        modalApi.unlock();
      }
    }
  },
});
function dateValue(value?: string) {
  return value && dayjs(value).isValid()
    ? dayjs(value).format('YYYY-MM-DD HH:mm:ss')
    : '';
}
function decodeContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value))
    return new TextDecoder().decode(new Uint8Array(value));
  if (
    value &&
    typeof value === 'object' &&
    'data' in value &&
    Array.isArray(value.data)
  )
    return new TextDecoder().decode(new Uint8Array(value.data));
  return '';
}
</script>
<template>
  <Modal>
    <el-alert
      v-if="failed"
      title="操作未完成，已保留当前输入，请重试"
      type="error"
      closable
      class="mb-3"
    />
    <Form />
  </Modal>
</template>
