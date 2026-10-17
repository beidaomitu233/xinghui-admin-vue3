<script setup lang="ts">
import type {
  FieldValue,
  FormField,
  Page as FormPage,
  FormRecord,
  FormRecordRow,
  RuntimeDefinition,
} from '#/api/lowcode/forms';
import type { SceneEntry } from '#/api/system/ai-scene';

import { computed, onBeforeUnmount, ref, toRaw, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  addRecord,
  getRecord,
  getRuntime,
  listRecords,
  removeRecord,
  updateRecord,
} from '#/api/lowcode/forms';
import { recordSummaryScene } from '#/api/system/ai-scene';

import {
  dataError,
  displayValue,
  initialData,
  schemaError,
} from '../form-schema';
import RuntimeFields from '../RuntimeFields.vue';
import AiSummaryDialog from './AiSummaryDialog.vue';

const access = useAccessStore();
const route = useRoute();
const router = useRouter();
const can = (action: string) =>
  access.accessCodes.includes(`lowcode:record:${action}`);
const result = ref<FormPage<FormRecordRow>>({
  records: [],
  total: '0',
  pageNum: 1,
  pageSize: 10,
});
const runtime = ref<RuntimeDefinition>();
const data = ref<Record<string, FieldValue>>({});
const detail = ref(false);
const dialog = ref(false);
const failed = ref(false);
const filterField = ref('');
const filterValue = ref('');
const loading = ref(false);
const pageNum = ref(1);
const pageSize = ref(10);
const saveFailed = ref(false);
const saving = ref(false);
const selected = ref<FormRecord>();
const summaryRecord = ref<FormRecord>();
const summaryOpen = ref(false);
const summaryLoading = ref(false);
const summaryError = ref('');
const summaryScene = ref<null | SceneEntry>(null);
const columns = computed(
  () => runtime.value?.schema.fields.filter((field) => field.listVisible) ?? [],
);
const queryFields = computed(
  () => runtime.value?.schema.fields.filter((field) => field.searchable) ?? [],
);
const queryField = computed(() =>
  queryFields.value.find((field) => field.fieldKey === filterField.value),
);
const editorSchema = computed(
  () => selected.value?.schema ?? runtime.value?.schema ?? { fields: [] },
);
let serial = 0;
let summarySerial = 0;
let editorSerial = 0;
onBeforeUnmount(() => {
  serial++;
  summarySerial++;
  editorSerial++;
});
async function load() {
  if (!can('list')) return;
  const run = ++serial;
  loading.value = true;
  failed.value = false;
  try {
    const id = String(route.params.formId);
    const value = await getRuntime(id);
    const records = await listRecords(id, {
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      filterField: filterField.value,
      filterValue: filterValue.value,
    });
    if (run !== serial) return;
    runtime.value = value;
    result.value = records;
    summaryScene.value = null;
    if (
      can('query') &&
      access.accessCodes.includes('ai:scene:invoke') &&
      import.meta.env.VITE_APP_DEMO !== 'true'
    ) {
      try {
        const application = await recordSummaryScene(id);
        if (run === serial) summaryScene.value = application;
      } catch {
        if (run === serial) summaryScene.value = null;
      }
    }
  } catch {
    if (run === serial) {
      failed.value = true;
      result.value.records = [];
    }
  } finally {
    if (run === serial) loading.value = false;
  }
}
function search() {
  pageNum.value = 1;
  void load();
}
async function summarize(row: FormRecordRow) {
  if (
    !can('query') ||
    !summaryScene.value ||
    !runtime.value ||
    summaryLoading.value
  )
    return;
  const formId = runtime.value.id;
  if (row.formId !== formId) {
    summaryError.value = '记录读取失败，请重试。';
    return;
  }
  const application = summaryScene.value;
  editorSerial++;
  const run = ++summarySerial;
  const listGeneration = serial;
  summaryLoading.value = true;
  summaryError.value = '';
  summaryOpen.value = false;
  summaryRecord.value = undefined;
  try {
    // List rows omit schema. Only the authorized detail supplies this record's historical schema.
    const record = await getRecord(formId, row.id);
    if (
      run !== summarySerial ||
      listGeneration !== serial ||
      !can('query') ||
      runtime.value?.id !== formId ||
      String(route.params.formId) !== formId ||
      summaryScene.value?.sceneKey !== application.sceneKey ||
      summaryScene.value?.currentVersionId !== application.currentVersionId
    )
      return;
    if (!validRecordDetail(record, row, formId))
      throw new Error('INVALID_RECORD_DETAIL');
    summaryRecord.value = record;
    summaryOpen.value = true;
  } catch {
    if (run === summarySerial && listGeneration === serial)
      summaryError.value = '记录读取失败，请重试。';
  } finally {
    if (run === summarySerial) summaryLoading.value = false;
  }
}
async function adoptSummary(fieldKey: string, text: string) {
  const row = summaryRecord.value;
  const formId = runtime.value?.id;
  const summaryGeneration = summarySerial;
  if (!row || !formId || row.formId !== formId || !can('query') || !can('edit'))
    return;
  const operation = await open(row);
  if (
    operation === undefined ||
    operation !== editorSerial ||
    summaryGeneration !== summarySerial ||
    !can('query') ||
    !can('edit') ||
    runtime.value?.id !== formId ||
    String(route.params.formId) !== formId ||
    !summaryRecord.value ||
    summaryRecord.value.id !== row.id ||
    summaryRecord.value.formId !== formId ||
    !selected.value ||
    selected.value.id !== row.id ||
    selected.value.formId !== formId ||
    selected.value.schemaVersion !== row.schemaVersion ||
    !dialog.value ||
    detail.value
  )
    return;
  const field = selected.value.schema.fields.find(
    (value) => value.fieldKey === fieldKey,
  );
  if (
    !field ||
    !['text', 'textarea'].includes(field.type) ||
    text.length > field.maxLength
  )
    return;
  data.value[fieldKey] = text;
  ElMessage.success('摘要已填入编辑草稿，请检查后保存');
}
async function open(row?: FormRecordRow, readOnly = false) {
  const form = runtime.value;
  if (
    !form ||
    String(route.params.formId) !== form.id ||
    (row && row.formId !== form.id)
  )
    return;
  const formId = form.id;
  const reference = row
    ? {
        id: row.id,
        formId: row.formId,
        schemaVersion: row.schemaVersion,
        revision: row.revision,
      }
    : undefined;
  const allowed = () =>
    reference ? can('query') && (readOnly || can('edit')) : can('add');
  if (!allowed()) return;
  const operation = ++editorSerial;
  const listGeneration = serial;
  const current = () =>
    operation === editorSerial &&
    listGeneration === serial &&
    runtime.value?.id === formId &&
    String(route.params.formId) === formId &&
    allowed();
  dialog.value = false;
  selected.value = undefined;
  try {
    const record = reference
      ? await getRecord(formId, reference.id)
      : undefined;
    if (!current()) return;
    if (reference && (!record || !validRecordDetail(record, reference, formId)))
      throw new Error('INVALID_RECORD_DETAIL');
    const values = record
      ? structuredClone(toRaw(record.data))
      : initialData(form.schema);
    if (!current()) return;
    selected.value = record;
    data.value = values;
    detail.value = readOnly;
    saveFailed.value = false;
    dialog.value = true;
    return operation;
  } catch {
    if (current()) summaryError.value = '记录读取失败，请重试。';
  }
}
function validRecordDetail(
  record: FormRecord,
  row: Pick<FormRecordRow, 'formId' | 'id' | 'revision' | 'schemaVersion'>,
  formId: string,
) {
  return (
    record.id === row.id &&
    record.formId === formId &&
    Number.isSafeInteger(record.schemaVersion) &&
    record.schemaVersion > 0 &&
    record.schemaVersion === row.schemaVersion &&
    Number.isSafeInteger(record.revision) &&
    record.revision >= 0 &&
    record.revision >= row.revision &&
    record.data !== null &&
    typeof record.data === 'object' &&
    !Array.isArray(record.data) &&
    record.schema &&
    Array.isArray(record.schema.fields) &&
    !schemaError(record.schema)
  );
}
async function save() {
  if (
    !runtime.value ||
    saving.value ||
    (selected.value ? !can('edit') : !can('add'))
  )
    return;
  const error = dataError(editorSchema.value, data.value);
  if (error) {
    ElMessage.warning(error);
    return;
  }
  saving.value = true;
  saveFailed.value = false;
  try {
    const input = {
      schemaVersion:
        selected.value?.schemaVersion ?? runtime.value.schemaVersion,
      revision: selected.value?.revision,
      data: data.value,
    };
    await (selected.value
      ? updateRecord(runtime.value.id, selected.value.id, input)
      : addRecord(runtime.value.id, input));
    dialog.value = false;
    ElMessage.success('记录已保存');
    await load();
  } catch {
    saveFailed.value = true;
  } finally {
    saving.value = false;
  }
}
async function reload() {
  if (!selected.value) return;
  try {
    await ElMessageBox.confirm(
      '重新读取将替换未保存的输入，是否继续？',
      '重新读取确认',
    );
  } catch {
    return;
  }
  await open(selected.value);
}
async function remove(row: FormRecordRow) {
  if (!runtime.value) return;
  try {
    await ElMessageBox.confirm('删除这条记录，是否继续？', '删除确认');
  } catch {
    return;
  }
  try {
    await removeRecord(runtime.value.id, row.id, row.revision);
    ElMessage.success('记录已删除');
    await load();
  } catch {
    /* Shared interceptor reports the error. */
  }
}
function formatted(field: FormField, row: FormRecordRow) {
  return displayValue(field, row.data[field.fieldKey]);
}
watch(
  () => [can('query'), can('edit'), can('add')] as const,
  ([query, edit, add], previous) => {
    if (
      (previous[0] && !query) ||
      (previous[1] && !edit) ||
      (previous[2] && !add)
    )
      editorSerial++;
    if (
      dialog.value &&
      (selected.value ? !query || (!detail.value && !edit) : !add)
    ) {
      dialog.value = false;
      selected.value = undefined;
      data.value = {};
    }
    if (!query) {
      summarySerial++;
      summaryLoading.value = false;
      summaryOpen.value = false;
      summaryRecord.value = undefined;
      summaryError.value = '';
    }
  },
  { flush: 'sync' },
);
watch(
  () => route.params.formId,
  () => {
    pageNum.value = 1;
    filterField.value = '';
    filterValue.value = '';
    runtime.value = undefined;
    summaryScene.value = null;
    summaryOpen.value = false;
    summaryRecord.value = undefined;
    summarySerial++;
    editorSerial++;
    summaryLoading.value = false;
    summaryError.value = '';
    dialog.value = false;
    selected.value = undefined;
    data.value = {};
    void load();
  },
  { immediate: true },
);
</script>
<template>
  <!-- Prettier formats adjacent inline controls; avoid conflicting whitespace rules. -->
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/html-closing-bracket-newline -->
  <Page :title="runtime ? `${runtime.name} · 数据` : '表单数据'">
    <el-card class="m-4">
      <el-alert
        v-if="!can('list')"
        title="没有数据列表权限"
        type="warning"
        closable
      />
      <template v-else>
        <el-form inline @submit.prevent="search">
          <el-form-item v-if="queryFields.length > 0" label="查询字段">
            <el-select
              v-model="filterField"
              clearable
              placeholder="选择字段"
              class="w-44"
              @change="filterValue = ''"
            >
              <el-option
                v-for="field in queryFields"
                :key="field.fieldKey"
                :label="field.label"
                :value="field.fieldKey"
              />
            </el-select>
          </el-form-item>
          <el-form-item v-if="queryField" :label="queryField.label">
            <el-select
              v-if="queryField.type === 'select'"
              v-model="filterValue"
              clearable
            >
              <el-option
                v-for="option in queryField.options"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
            <el-select
              v-else-if="queryField.type === 'switch'"
              v-model="filterValue"
              clearable
            >
              <el-option label="是" value="true" />
              <el-option label="否" value="false" />
            </el-select>
            <el-date-picker
              v-else-if="queryField.type === 'date'"
              v-model="filterValue"
              value-format="YYYY-MM-DD"
              type="date"
            />
            <el-input
              v-else
              v-model="filterValue"
              maxlength="5000"
              placeholder="输入查询内容"
              @keyup.enter="search"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="loading" @click="search">
              查询
            </el-button>
            <el-button
              @click="
                filterField = '';
                filterValue = '';
                search();
              "
            >
              重置
            </el-button>
            <el-button
              v-if="can('add') && runtime?.status === 'enabled'"
              @click="open()"
            >
              新增记录
            </el-button>
            <el-button
              v-if="can('add') && runtime?.status === 'enabled'"
              @click="router.push(`/lowcode/runtime/${runtime.id}`)"
            >
              打开填写页
            </el-button>
          </el-form-item>
        </el-form>
        <el-alert v-if="failed" title="数据加载失败" type="error" closable>
          <el-button @click="load">重试</el-button>
        </el-alert>
        <el-alert
          v-if="summaryError"
          :title="summaryError"
          type="error"
          closable
          class="mb-3"
          @close="summaryError = ''"
        />
        <el-table
          v-loading="loading"
          :data="result.records"
          row-key="id"
          border
          empty-text="暂无记录"
        >
          <el-table-column prop="id" label="编号" min-width="90" />
          <el-table-column
            v-for="field in columns"
            :key="field.fieldKey"
            :label="field.label"
            min-width="160"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              {{ formatted(field, row) }}
            </template>
          </el-table-column>
          <el-table-column prop="schemaVersion" label="填写版本" width="100" />
          <el-table-column prop="updateTime" label="更新时间" min-width="170" />
          <el-table-column label="操作" width="250">
            <template #default="{ row }">
              <el-button v-if="can('query')" link @click="open(row, true)">
                详情
              </el-button>
              <el-button
                v-if="can('query') && summaryScene"
                link
                type="primary"
                :loading="summaryLoading"
                @click="summarize(row)"
              >
                AI 摘要
              </el-button>
              <el-button
                v-if="can('query') && can('edit')"
                link
                type="primary"
                @click="open(row)"
              >
                编辑
              </el-button>
              <el-button
                v-if="can('remove')"
                link
                type="danger"
                @click="remove(row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          class="mt-4"
          v-model:current-page="pageNum"
          v-model:page-size="pageSize"
          :total="Number(result.total)"
          :page-sizes="[10, 20, 50, 100]"
          layout="total,sizes,prev,pager,next"
          @current-change="load"
          @size-change="search"
        />
      </template>
    </el-card>
    <el-dialog
      v-model="dialog"
      :title="detail ? '记录详情' : selected ? '编辑记录' : '新增记录'"
      width="min(760px,92vw)"
      :close-on-click-modal="false"
      :show-close="!saving"
      :close-on-press-escape="!saving"
    >
      <el-alert
        v-if="saveFailed"
        title="保存未成功，输入已保留。版本冲突时请重新读取。"
        type="error"
        closable
      >
        <el-button v-if="selected" :disabled="saving" @click="reload">
          重新读取
        </el-button>
      </el-alert>
      <el-descriptions v-if="detail" :column="1" border>
        <el-descriptions-item
          v-for="field in editorSchema.fields"
          :key="field.fieldKey"
          :label="field.label"
        >
          <pre class="whitespace-pre-wrap break-all font-sans">{{
            displayValue(field, data[field.fieldKey])
          }}</pre>
        </el-descriptions-item>
      </el-descriptions>
      <RuntimeFields
        v-else
        v-model="data"
        :schema="editorSchema"
        :disabled="saving"
      />
      <template #footer>
        <el-button :disabled="saving" @click="dialog = false">关闭</el-button>
        <el-button
          v-if="!detail && (selected ? can('edit') : can('add'))"
          type="primary"
          :loading="saving"
          @click="save"
        >
          保存记录
        </el-button>
      </template>
    </el-dialog>
    <AiSummaryDialog
      v-if="summaryRecord && summaryScene && runtime"
      v-model="summaryOpen"
      :scene-key="summaryScene.sceneKey"
      :form-id="runtime.id"
      :record-id="summaryRecord.id"
      :fields="summaryRecord.schema.fields"
      :writable="can('query') && can('edit')"
      @adopt="adoptSummary"
    />
  </Page>
</template>
