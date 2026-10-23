<script setup lang="ts">
import type { FillDefinition, FillReceipt } from '#/api/lowcode/fill';
import type { FieldValue, FormSchema } from '#/api/lowcode/forms';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { ElMessageBox } from 'element-plus';

import { FillError, readFillForm, submitFillForm } from '#/api/lowcode/fill';
import AdminPageHeader from '#/components/admin-page-header.vue';
import { useAuthStore } from '#/store/auth';

import { dataError, initialData } from '../form-schema';
import RuntimeFields from '../RuntimeFields.vue';

const route = useRoute();
const auth = useAuthStore();
const definition = ref<FillDefinition>();
const data = ref<Record<string, FieldValue>>({});
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const errorStatus = ref(0);
const receipt = ref<FillReceipt>();
const requestKey = ref('');
const schema = computed<FormSchema>(() => ({
  fields: (definition.value?.fields ?? []).map((field) => ({
    ...field,
    listVisible: false,
    searchable: false,
  })),
}));
const token = computed(() => String(route.params.token ?? ''));
let serial = 0;
onBeforeUnmount(() => {
  serial++;
});
function submissionKey(reset = false) {
  const key = `lowcode-fill:${token.value}`;
  try {
    const previous = !reset && sessionStorage.getItem(key);
    if (previous && /^[\w-]{16,80}$/u.test(previous)) return previous;
    const value = crypto.randomUUID();
    sessionStorage.setItem(key, value);
    return value;
  } catch {
    return crypto.randomUUID();
  }
}
async function load() {
  const run = ++serial;
  saving.value = false;
  data.value = {};
  loading.value = true;
  error.value = '';
  errorStatus.value = 0;
  definition.value = undefined;
  receipt.value = undefined;
  try {
    const result = await readFillForm(token.value);
    if (run !== serial) return;
    definition.value = result;
    data.value = initialData(schema.value);
    requestKey.value = submissionKey();
  } catch (error_) {
    if (run === serial) showError(error_);
  } finally {
    if (run === serial) loading.value = false;
  }
}
function showError(failure: unknown) {
  error.value =
    failure instanceof FillError ? failure.message : '请求未完成，请稍后重试';
  errorStatus.value = failure instanceof FillError ? failure.status : 0;
}
async function reload() {
  try {
    await ElMessageBox.confirm(
      '重新读取将替换未提交的填写，是否继续？',
      '重新读取表单',
    );
  } catch {
    return;
  }
  await load();
}
async function submit() {
  if (
    !definition.value ||
    saving.value ||
    receipt.value ||
    [403, 410].includes(errorStatus.value)
  )
    return;
  const invalid = dataError(schema.value, data.value);
  if (invalid) {
    error.value = invalid;
    return;
  }
  const run = serial;
  saving.value = true;
  error.value = '';
  errorStatus.value = 0;
  try {
    const result = await submitFillForm(token.value, {
      schemaVersion: definition.value.schemaVersion,
      requestKey: requestKey.value,
      data: data.value,
    });
    if (run === serial) receipt.value = result;
  } catch (error_) {
    if (run === serial) showError(error_);
  } finally {
    if (run === serial) saving.value = false;
  }
}
function again() {
  receipt.value = undefined;
  data.value = initialData(schema.value);
  requestKey.value = submissionKey(true);
}
function login() {
  void auth.expireSession(true);
}

watch(token, () => void load(), { immediate: true });
</script>
<template>
  <main class="fill-page">
    <section v-loading="loading" class="fill-card" aria-label="填写表单">
      <AdminPageHeader :title="definition?.title || '填写表单'" />
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        role="alert"
        class="mb-4"
      />
      <section v-if="receipt" aria-label="提交结果">
        <el-result icon="success" title="提交成功" sub-title="填写已保存">
          <template #extra>
            <el-button @click="again">再次填写</el-button>
          </template>
        </el-result>
      </section>
      <div v-else-if="definition">
        <RuntimeFields
          v-model="data"
          :schema="schema"
          :disabled="saving || [403, 410].includes(errorStatus)"
          @submit="submit"
        >
          <template #actions>
            <div class="fill-actions">
              <el-button
                v-if="![403, 410].includes(errorStatus)"
                type="primary"
                native-type="submit"
                :loading="saving"
              >
                提交填写
              </el-button>
              <el-button
                v-if="errorStatus === 409"
                :disabled="saving"
                @click="reload"
              >
                重新读取表单
              </el-button>
              <el-button v-if="[401, 403].includes(errorStatus)" @click="login">
                {{ errorStatus === 403 ? '切换账号' : '登录后填写' }}
              </el-button>
            </div>
          </template>
        </RuntimeFields>
      </div>
      <div v-else-if="!loading" class="fill-actions">
        <el-button
          v-if="[401, 403].includes(errorStatus)"
          type="primary"
          @click="login"
        >
          {{ errorStatus === 403 ? '切换账号' : '登录后填写' }}
        </el-button>
        <el-button @click="load">重新读取</el-button>
      </div>
    </section>
  </main>
</template>
<style scoped>
.fill-page {
  min-height: 100dvh;
  padding: 32px 16px;
  background: hsl(var(--muted) / 40%);
}

.fill-card {
  width: 100%;
  max-width: 760px;
  padding: 24px;
  margin: 0 auto;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.fill-card :deep(.admin-page-header) {
  margin-bottom: 24px;
}

.fill-card :deep(.el-select),
.fill-card :deep(.el-date-editor.el-input) {
  width: 100%;
}

.fill-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 24px;
}

@media (max-width: 600px) {
  .fill-page {
    padding: 16px 8px;
  }

  .fill-card {
    padding: 20px 16px;
  }
}
</style>
