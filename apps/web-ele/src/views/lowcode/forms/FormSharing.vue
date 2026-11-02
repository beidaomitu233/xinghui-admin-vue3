<script setup lang="ts">
import type { FormDefinition, SharingSettings } from '#/api/lowcode/forms';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenForm } from '#/adapter/form';
import { readSharing, saveSharing } from '#/api/lowcode/forms';

const props = defineProps<{ form?: FormDefinition; modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const router = useRouter();
const access = useAccessStore();
const canPublish = computed(() =>
  access.accessCodes.includes('lowcode:form:publish'),
);
const loaded = ref(false);
const [Modal, modalApi] = useVbenModal({
  title: '分享填写',
  class: 'w-[min(620px,94vw)]',
  confirmText: '保存分享设置',
  closeOnClickModal: false,
  onConfirm: () => save(),
  onOpenChange(open) {
    if (!open) {
      serial++;
      loaded.value = false;
      emit('update:modelValue', false);
    }
  },
});
const [Form, formApi] = useVbenForm({
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1',
  schema: [
    { fieldName: 'enabled', component: 'Switch', label: '允许通过链接填写' },
    {
      fieldName: 'accessMode',
      component: 'RadioGroup',
      label: '填写范围',
      componentProps: {
        options: [
          { label: '仅当前范围内的登录用户', value: 'login' },
          { label: '持有链接的任何人', value: 'public' },
        ],
      },
    },
  ],
  handleValuesChange(values) {
    settings.value.enabled = values.enabled === true;
    settings.value.accessMode =
      values.accessMode === 'public' ? 'public' : 'login';
  },
});
const settings = ref<SharingSettings>({
  enabled: false,
  accessMode: 'login',
  revision: 0,
  token: null,
});
const busy = ref(false);
const error = ref('');
const savedMode = ref<'login' | 'public'>('login');
const savedEnabled = ref(false);
let serial = 0;
onBeforeUnmount(() => {
  serial++;
});
const url = computed(() =>
  settings.value.token
    ? new URL(
        router.resolve({
          name: 'LowcodeSharedFill',
          params: { token: settings.value.token },
        }).href,
        location.href,
      ).href
    : '',
);
watch([() => props.modelValue, () => props.form?.id], async ([value, id]) => {
  const run = ++serial;
  loaded.value = false;
  settings.value.token = null;
  if (!value || typeof id !== 'string') {
    modalApi.close();
    return;
  }
  modalApi.setState({ loading: true, confirmDisabled: true });
  modalApi.open();
  formApi.updateSchema([
    {
      fieldName: 'enabled',
      componentProps: { disabled: props.form?.status !== 'enabled' },
    },
  ]);
  busy.value = true;
  error.value = '';
  savedMode.value = 'login';
  savedEnabled.value = false;
  settings.value = {
    enabled: false,
    accessMode: 'login',
    revision: 0,
    token: null,
  };
  try {
    const fresh = await readSharing(id);
    if (run === serial) {
      await accept(fresh);
      loaded.value = true;
    }
  } catch {
    if (run === serial) error.value = '分享设置读取失败，请关闭后重新打开';
  } finally {
    if (run === serial) {
      busy.value = false;
      formApi.setState({ commonConfig: { disabled: false } });
      modalApi.setState({
        loading: false,
        confirmLoading: false,
        confirmDisabled: !loaded.value || !canPublish.value,
      });
    }
  }
});
async function accept(value: SharingSettings) {
  settings.value = value;
  await formApi.resetForm({
    values: { enabled: value.enabled, accessMode: value.accessMode },
  });
  savedMode.value = value.accessMode;
  savedEnabled.value = value.enabled;
}
async function save(rotate = false, revoke = false) {
  if (!props.form || busy.value || !loaded.value || !canPublish.value) return;
  const formId = props.form.id;
  const run = serial;
  busy.value = true;
  modalApi.lock();
  error.value = '';
  formApi.setState({ commonConfig: { disabled: true } });
  try {
    const values = await formApi.getValues();
    const candidate = {
      ...settings.value,
      enabled: values.enabled === true,
      accessMode:
        values.accessMode === 'public'
          ? ('public' as const)
          : ('login' as const),
    };
    const enabled = !revoke && candidate.enabled;
    if (
      enabled &&
      candidate.accessMode === 'public' &&
      (!savedEnabled.value || savedMode.value !== 'public')
    ) {
      await ElMessageBox.confirm(
        '开启后持有链接的任何人无需登录即可填写，但不能查看已有答案。是否继续？',
        '开启公开填写',
      );
    }
    if (rotate)
      await ElMessageBox.confirm(
        '重新生成后，原链接和已打开的旧填写页将无法提交。是否继续？',
        '重新生成填写链接',
      );
    if (run !== serial || props.form?.id !== formId || !canPublish.value)
      return;
    const fresh = await saveSharing(formId, {
      enabled,
      accessMode: candidate.accessMode,
      revision: candidate.revision,
      rotate,
    });
    if (run !== serial) return;
    await accept(fresh);
    ElMessage.success(revoke ? '填写链接已撤销' : '分享设置已保存');
  } catch (error_) {
    if (error_ !== 'cancel' && error_ !== 'close' && run === serial)
      error.value =
        '保存未成功，设置已保留。若设置已被修改，请关闭后重新读取。';
  } finally {
    if (run === serial) {
      busy.value = false;
      modalApi.unlock();
      formApi.setState({ commonConfig: { disabled: false } });
      modalApi.setState({
        confirmDisabled: !loaded.value || !canPublish.value,
      });
    }
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(url.value);
    ElMessage.success('填写链接已复制');
  } catch {
    ElMessage.info('请从链接框选择并复制填写地址');
  }
}
</script>
<template>
  <Modal>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      class="mb-4"
    />
    <p class="mb-4">
      {{ form?.name }} · 填写者不能查看已有答案，也不会获得后台管理权限。
    </p>
    <Form />
    <el-alert
      v-if="form?.status !== 'enabled'"
      title="请先发布并启用表单，再开启分享填写。"
      type="info"
      :closable="false"
    />
    <div v-if="url && savedEnabled" class="my-4">
      <el-input :model-value="url" readonly aria-label="填写链接" />
    </div>
    <div v-if="url && savedEnabled" class="flex flex-wrap gap-2">
      <el-button @click="copy">复制链接</el-button>
      <a
        class="el-button"
        :href="url"
        target="_blank"
        rel="noopener noreferrer"
      >
        在新标签页打开
      </a>
      <el-button :disabled="busy || !loaded" @click="save(true)">
        重新生成链接
      </el-button>
      <el-button
        type="danger"
        :disabled="busy || !loaded"
        @click="save(false, true)"
      >
        撤销链接
      </el-button>
    </div>
  </Modal>
</template>
