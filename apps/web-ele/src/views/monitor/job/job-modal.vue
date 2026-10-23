<script lang="ts" setup>
import type { JobChangePayload, JobInfo } from '#/api/monitor/job';

import { ref, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenForm, z } from '#/adapter/form';
import {
  addJob,
  getJob,
  getJobHandlers,
  updateJob,
} from '#/api/monitor/job';

const emit = defineEmits<{ saved: [] }>();
const access = useAccessStore();
const can = (code: string) => access.accessCodes.includes(code);
const busy = ref(false);
const submitError = ref('');
const handlers = ref<string[]>([]);
const handlersLoading = ref(false);
const editingId = ref<string>();
let saved = false;
let baseline: JobChangePayload | undefined;
let prepared = false;
let request = 0;

function emptyForm(): JobChangePayload {
  return {
    jobName: '',
    jobGroup: 'DEFAULT',
    handlerKey: '',
    handlerParams: '{}',
    cronExpression: '0 */5 * * * ?',
    timeZone: 'Asia/Shanghai',
    misfirePolicy: '3',
    concurrent: '1',
    status: '1',
    remark: '',
  };
}

const [Form, formApi] = useVbenForm({
  commonConfig: { componentProps: { class: 'w-full' }, labelWidth: 100 },
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1',
  schema: [
    {
      fieldName: 'jobName',
      label: '任务名称',
      component: 'Input',
      componentProps: { maxlength: 64 },
      rules: z.string().min(1, '请填写任务名称').max(64),
    },
    {
      fieldName: 'jobGroup',
      label: '任务组',
      component: 'Input',
      componentProps: { maxlength: 64 },
      rules: z.string().min(1, '请填写任务组').max(64),
    },
    {
      fieldName: 'handlerKey',
      label: '受控处理器',
      component: 'Select',
      componentProps: {
        clearable: false,
        options: [],
        placeholder: '选择已注册的处理器',
      },
      rules: z.string().min(1, '请选择受控处理器'),
    },
    {
      fieldName: 'handlerParams',
      label: '处理器参数',
      component: 'Textarea',
      componentProps: { placeholder: 'JSON 对象，例如 {}', rows: 3 },
      help: '必须是 JSON 对象，保存前会做格式校验。',
    },
    {
      fieldName: 'cronExpression',
      label: '六段 Cron',
      component: 'Input',
      componentProps: { placeholder: '例如 0 */5 * * * ?' },
      rules: z.string().min(1, '请填写六段 Cron'),
    },
    {
      fieldName: 'timeZone',
      label: 'IANA 时区',
      component: 'Input',
      componentProps: { placeholder: '例如 Asia/Shanghai' },
      rules: z.string().min(1, '请填写 IANA 时区'),
    },
    {
      fieldName: 'misfirePolicy',
      label: '错过执行',
      component: 'RadioGroup',
      defaultValue: '3',
      componentProps: {
        options: [
          { label: '跳过', value: '3' },
          { label: '补执行一次', value: '2' },
        ],
      },
    },
    {
      fieldName: 'concurrent',
      label: '重叠执行',
      component: 'RadioGroup',
      defaultValue: '1',
      componentProps: {
        options: [
          { label: '跳过重叠', value: '1' },
          { label: '允许并行', value: '0' },
        ],
      },
    },
    {
      fieldName: 'status',
      label: '创建后状态',
      component: 'RadioGroup',
      defaultValue: '1',
      componentProps: {
        options: [
          { label: '暂停', value: '1' },
          { label: '启用', value: '0' },
        ],
      },
      help: '仅新增时生效；启用任务会进入调度。',
    },
    {
      fieldName: 'remark',
      label: '备注',
      component: 'Textarea',
      componentProps: { maxlength: 500, rows: 2 },
    },
  ],
});

watch(busy, (value) => formApi.setState({ commonConfig: { disabled: value } }), { flush: 'sync' });

async function loadHandlers() {
  handlersLoading.value = true;
  try {
    handlers.value = await getJobHandlers();
  } catch {
    handlers.value = [];
    submitError.value = '获取受控处理器失败，请关闭后重试';
  } finally {
    handlersLoading.value = false;
  }
}

const [Modal, modalApi] = useVbenModal({
  confirmText: '保存',
  onBeforeClose: async () => {
    if (busy.value) return false;
    if (saved || !prepared) return true;
    const values = await formApi.getValues<JobChangePayload>();
    const changed = Object.keys(emptyForm()).some((key) => {
      const field = key as keyof JobChangePayload;
      return (
        JSON.stringify(values[field] ?? baseline?.[field]) !==
        JSON.stringify(baseline?.[field])
      );
    });
    if (!changed) return true;
    try {
      await ElMessageBox.confirm('当前修改尚未保存，确定放弃吗？', '未保存的修改', {
        cancelButtonText: '继续编辑',
        confirmButtonText: '放弃修改',
        type: 'warning',
      });
      return true;
    } catch {
      return false;
    }
  },
  onConfirm: async () => {
    if (busy.value || !prepared) return;
    busy.value = true;
    submitError.value = '';
    modalApi.lock();
    try {
      const validation = await formApi.validate();
      if (!validation.valid) return;
      const values = await formApi.getValues<JobChangePayload>();
      try {
        const parsed: unknown = JSON.parse(values.handlerParams || '{}');
        if (
          parsed === null ||
          Array.isArray(parsed) ||
          typeof parsed !== 'object'
        ) {
          throw new Error('JSON object required');
        }
      } catch {
        formApi.form.setFieldError('handlerParams', '处理器参数必须是 JSON 对象');
        return;
      }
      const payload = { ...values, jobId: editingId.value };
      await (editingId.value ? updateJob(payload) : addJob(payload));
      saved = true;
      ElMessage.success('保存成功');
      await modalApi.close();
      emit('saved');
    } catch (error) {
      const failure = error as { message?: string };
      submitError.value =
        failure?.message ?? '保存失败，请检查处理器参数、Cron 和时区';
    } finally {
      busy.value = false;
      modalApi.unlock();
    }
  },
  onOpenChange: async (isOpen) => {
    const current = ++request;
    if (!isOpen) return;
    const data = modalApi.getData<{ row?: JobInfo }>();
    editingId.value = data.row?.jobId;
    submitError.value = '';
    prepared = false;
    baseline = undefined;
    const allowed = editingId.value
      ? can('monitor:job:edit') && can('monitor:job:query')
      : can('monitor:job:add');
    if (!allowed) {
      await modalApi.close();
      return;
    }
    busy.value = true;
    modalApi.setState({
      loading: true,
      title: editingId.value ? '编辑任务' : '新增任务',
    });
    try {
      await formApi.resetForm();
      let value = emptyForm();
      if (data.row) {
        try {
          const detail = await getJob(data.row.jobId);
          value = {
            ...value,
            jobId: detail.jobId,
            jobName: detail.jobName,
            jobGroup: detail.jobGroup,
            handlerKey: detail.handlerKey || '',
            handlerParams: detail.handlerParams || '{}',
            cronExpression: detail.cronExpression,
            timeZone: detail.timeZone || 'Asia/Shanghai',
            misfirePolicy: detail.misfirePolicy === '2' ? '2' : '3',
            concurrent: detail.concurrent === '0' ? '0' : '1',
            status: detail.status === '0' ? '0' : '1',
            remark: detail.remark || '',
          };
        } catch {
          submitError.value = '获取任务详情失败';
        }
      }
      await loadHandlers();
      if (current !== request) return;
      await formApi.setValues(value);
      await formApi.updateSchema([
        {
          fieldName: 'handlerKey',
          componentProps: {
            clearable: false,
            loading: handlersLoading.value,
            options: handlers.value.map((key) => ({ label: key, value: key })),
            placeholder: '选择已注册的处理器',
          },
        },
        {
          fieldName: 'status',
          // 编辑时状态由“启用/暂停”操作管理，表单不允许直接改
          componentProps: {
            disabled: editingId.value !== undefined,
            options: [
              { label: '暂停', value: '1' },
              { label: '启用', value: '0' },
            ],
          },
        },
      ]);
      baseline = { ...value };
      prepared = true;
    } finally {
      busy.value = false;
      modalApi.setState({ loading: false });
    }
  },
});
</script>

<template>
  <Modal class="w-full max-w-[620px]">
    <el-alert
      v-if="submitError"
      :title="submitError"
      type="error"
      show-icon
      class="mb-4"
    />
    <Form />
  </Modal>
</template>
