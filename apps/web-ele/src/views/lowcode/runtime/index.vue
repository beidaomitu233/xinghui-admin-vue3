<script setup lang="ts">
import type { FieldValue, RuntimeDefinition } from '#/api/lowcode/forms';

import { onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { addRecord, getRuntime } from '#/api/lowcode/forms';
import AdminPageHeader from '#/components/admin-page-header.vue';

import { dataError, initialData } from '../form-schema';
import RuntimeFields from '../RuntimeFields.vue';

const access = useAccessStore();
const route = useRoute();
const router = useRouter();
const can = (action: string) =>
  access.accessCodes.includes(`lowcode:record:${action}`);
const data = ref<Record<string, FieldValue>>({});
const failed = ref(false);
const loading = ref(false);
const runtime = ref<RuntimeDefinition>();
const savedId = ref<string>();
const saveFailed = ref(false);
const saving = ref(false);
let serial = 0;
onBeforeUnmount(() => {
  serial++;
});
async function load() {
  const run = ++serial;
  loading.value = true;
  failed.value = false;
  runtime.value = undefined;
  savedId.value = undefined;
  try {
    const value = await getRuntime(String(route.params.formId));
    if (run !== serial) return;
    runtime.value = value;
    data.value = initialData(value.schema);
    saveFailed.value = false;
  } catch {
    if (run === serial) failed.value = true;
  } finally {
    if (run === serial) loading.value = false;
  }
}
async function reload() {
  try {
    await ElMessageBox.confirm(
      '重新读取将替换未保存的输入，是否继续？',
      '重新读取确认',
    );
  } catch {
    return;
  }
  await load();
}
async function submit() {
  if (
    !runtime.value ||
    !can('add') ||
    runtime.value.status !== 'enabled' ||
    saving.value
  )
    return;
  const error = dataError(runtime.value.schema, data.value);
  if (error) {
    ElMessage.warning(error);
    return;
  }
  saving.value = true;
  saveFailed.value = false;
  try {
    const record = await addRecord(runtime.value.id, {
      schemaVersion: runtime.value.schemaVersion,
      data: data.value,
    });
    savedId.value = record.id;
    ElMessage.success('记录已保存');
  } catch {
    saveFailed.value = true;
  } finally {
    saving.value = false;
  }
}
watch(
  () => route.params.formId,
  () => {
    if (can('add')) void load();
  },
  { immediate: true },
);
</script>
<template>
  <!-- Prettier formats adjacent inline controls; avoid conflicting whitespace rules. -->
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/html-closing-bracket-newline -->
  <Page class="admin-page">
    <AdminPageHeader :title="runtime?.name || '填写表单'" />
    <el-card v-loading="loading" class="max-w-4xl">
      <el-alert
        v-if="!can('add')"
        title="没有填写权限"
        type="warning"
        closable
      />
      <el-alert
        v-else-if="failed"
        title="表单读取失败，可能尚未发布或不存在"
        type="error"
        closable
      >
        <el-button @click="load">重试</el-button>
      </el-alert>
      <template v-else-if="runtime">
        <el-alert
          v-if="runtime.status !== 'enabled'"
          title="表单已停用，不能新增记录"
          type="warning"
          closable
        />
        <el-alert
          v-if="saveFailed"
          title="提交未成功，输入已保留。版本更新时请重新读取后填写。"
          type="error"
          closable
        >
          <el-button :disabled="saving" @click="reload">重新读取</el-button>
        </el-alert>
        <el-alert v-if="savedId" title="记录已保存" type="success" closable>
          <el-button
            v-if="can('list')"
            @click="router.push(`/lowcode/records/${runtime.id}`)"
          >
            查看数据
          </el-button>
          <el-button
            @click="
              data = initialData(runtime.schema);
              savedId = undefined;
            "
          >
            继续填写
          </el-button>
        </el-alert>
        <RuntimeFields
          v-model="data"
          :schema="runtime.schema"
          :disabled="saving || runtime.status !== 'enabled' || Boolean(savedId)"
        />
        <el-button
          type="primary"
          :loading="saving"
          :disabled="runtime.status !== 'enabled' || Boolean(savedId)"
          @click="submit"
        >
          提交记录
        </el-button>
        <el-button
          v-if="can('list')"
          :disabled="saving"
          @click="router.push(`/lowcode/records/${runtime.id}`)"
        >
          数据列表
        </el-button>
      </template>
    </el-card>
  </Page>
</template>
