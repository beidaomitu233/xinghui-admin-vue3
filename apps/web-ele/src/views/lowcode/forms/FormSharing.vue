<script setup lang="ts">
import type { FormDefinition, SharingSettings } from '#/api/lowcode/forms';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { ElMessage, ElMessageBox } from 'element-plus';

import { readSharing, saveSharing } from '#/api/lowcode/forms';

const props = defineProps<{ form?: FormDefinition; modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const router = useRouter();
const opened = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
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
  if (!value || typeof id !== 'string') return;
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
    if (run === serial) accept(fresh);
  } catch {
    if (run === serial) error.value = '分享设置读取失败，请关闭后重新打开';
  } finally {
    if (run === serial) busy.value = false;
  }
});
function accept(value: SharingSettings) {
  settings.value = value;
  savedMode.value = value.accessMode;
  savedEnabled.value = value.enabled;
}
async function save(rotate = false, revoke = false) {
  if (!props.form || busy.value) return;
  const formId = props.form.id;
  const run = serial;
  const candidate = { ...settings.value };
  const enabled = !revoke && candidate.enabled;
  if (
    enabled &&
    settings.value.accessMode === 'public' &&
    (!savedEnabled.value || savedMode.value !== 'public')
  ) {
    try {
      await ElMessageBox.confirm(
        '开启后持有链接的任何人无需登录即可填写，但不能查看已有答案。是否继续？',
        '开启公开填写',
      );
    } catch {
      return;
    }
  }
  if (rotate) {
    try {
      await ElMessageBox.confirm(
        '重新生成后，原链接和已打开的旧填写页将无法提交。是否继续？',
        '重新生成填写链接',
      );
    } catch {
      return;
    }
  }
  if (run !== serial || props.form?.id !== formId) return;
  busy.value = true;
  error.value = '';
  try {
    const fresh = await saveSharing(formId, {
      enabled,
      accessMode: candidate.accessMode,
      revision: candidate.revision,
      rotate,
    });
    if (run !== serial) return;
    accept(fresh);
    ElMessage.success(revoke ? '填写链接已撤销' : '分享设置已保存');
  } catch {
    if (run === serial)
      error.value =
        '保存未成功，设置已保留。若设置已被修改，请关闭后重新读取。';
  } finally {
    if (run === serial) busy.value = false;
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
  <el-dialog
    v-model="opened"
    title="分享填写"
    width="min(620px,94vw)"
    :close-on-click-modal="false"
    :show-close="!busy"
    :close-on-press-escape="!busy"
  >
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
    <el-form label-position="top" :disabled="busy">
      <el-form-item label="允许通过链接填写">
        <el-switch
          v-model="settings.enabled"
          :disabled="form?.status !== 'enabled'"
        />
      </el-form-item>
      <el-form-item label="填写范围">
        <el-radio-group v-model="settings.accessMode">
          <el-radio value="login">仅当前范围内的登录用户</el-radio>
          <el-radio value="public">持有链接的任何人</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-alert
        v-if="form?.status !== 'enabled'"
        title="请先发布并启用表单，再开启分享填写。"
        type="info"
        :closable="false"
      />
      <el-form-item v-if="url && savedEnabled" label="填写链接">
        <el-input :model-value="url" readonly aria-label="填写链接" />
      </el-form-item>
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
        <el-button @click="save(true)">重新生成链接</el-button>
        <el-button type="danger" @click="save(false, true)">撤销链接</el-button>
      </div>
    </el-form>
    <template #footer>
      <el-button :disabled="busy" @click="opened = false">关闭</el-button>
      <el-button type="primary" :loading="busy" @click="save()">
        保存分享设置
      </el-button>
    </template>
  </el-dialog>
</template>
