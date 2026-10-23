<script setup lang="ts">
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type {
  FieldValue,
  FormRecord,
  FormRecordRow,
  RuntimeDefinition,
} from '#/api/lowcode/forms';
import type { SceneEntry } from '#/api/system/ai-scene';

import { computed, nextTick, onBeforeUnmount, ref, toRaw, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page, useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenForm } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
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
import { fieldControl, recordFormSchema, safeGridTotal } from '../record-form';
import AiSummaryDialog from './AiSummaryDialog.vue';

const access = useAccessStore();
const route = useRoute();
const router = useRouter();
const can = (action: string) =>
  access.accessCodes.includes(`lowcode:record:${action}`);
const runtime = ref<RuntimeDefinition>();
const data = ref<Record<string, FieldValue>>({});
const detail = ref(false);
const dialog = ref(false);
const failed = ref(false);
const filterField = ref('');
const saveFailed = ref(false);
const saving = ref(false);
const selected = ref<FormRecord>();
const summaryRecord = ref<FormRecord>();
const summaryOpen = ref(false);
const summaryLoading = ref(false);
const summaryError = ref('');
const summaryScene = ref<null | SceneEntry>(null);
const editorSchema = computed(
  () => selected.value?.schema ?? runtime.value?.schema ?? { fields: [] },
);
let serial = 0;
let summarySerial = 0;
let editorSerial = 0;
onBeforeUnmount(() => {
  serial++;
  latestQuery = Promise.resolve({ items: [], total: 0 });
  summarySerial++;
  editorSerial++;
});
let refreshVersion = 0;
type GridResult = { items: FormRecordRow[]; total: number };
let latestQuery: Promise<GridResult> = Promise.resolve({ items: [], total: 0 });
function listParameters(
  pageNum: number,
  pageSize: number,
  sort: undefined | { field: string; order?: null | string },
  values: Record<string, unknown> = {},
) {
  return {
    pageNum,
    pageSize,
    filterField: String(values.filterField || '') || undefined,
    filterValue:
      values.filterValue === null || values.filterValue === undefined
        ? undefined
        : String(values.filterValue),
    orderBy: sort?.order ? sort.field : 'id',
    order: sort?.order === 'asc' ? ('asc' as const) : ('desc' as const),
  };
}
const gridOptions: VxeTableGridOptions<FormRecordRow> = {
  columns: [],
  height: 'auto',
  rowConfig: { keyField: 'id' },
  pagerConfig: { pageSize: 10, pageSizes: [10, 20, 50, 100] },
  proxyConfig: {
    sort: true,
    ajax: {
      query: ({ page, sort }, values) => {
        const run = ++serial;
        const id = String(route.params.formId);
        failed.value = false;
        latestQuery = (async (): Promise<GridResult> => {
          if (!can('list')) return { items: [], total: 0 };
          try {
            const definition = await getRuntime(id);
            let parameters = listParameters(
              page.currentPage,
              page.pageSize,
              sort,
              values,
            );
            let records: Awaited<ReturnType<typeof listRecords>> | undefined;
            for (;;) {
              const requestRefresh = refreshVersion;

              let failure: unknown;
              try {
                records = await listRecords(id, parameters);
              } catch (error) {
                failure = error;
              }
              if (run !== serial) return latestQuery;
              if (String(route.params.formId) !== id || !can('list'))
                return { items: [], total: 0 };
              if (gridApi.grid.getCurrentPage) {
                const current = listParameters(
                  gridApi.grid.getCurrentPage(),
                  gridApi.grid.getPageSize(),
                  gridApi.grid.getSortColumns()[0],
                  gridApi.formApi.getLatestSubmissionValues(),
                );
                if (JSON.stringify(current) !== JSON.stringify(parameters)) {
                  parameters = current;
                  continue;
                }
              }
              if (requestRefresh !== refreshVersion) continue;
              if (failure) throw failure;
              break;
            }
            if (!records) throw new Error('记录列表未返回结果');
            const schemaChanged =
              runtime.value?.id !== definition.id ||
              JSON.stringify(runtime.value.schema) !==
                JSON.stringify(definition.schema);
            runtime.value = definition;
            if (schemaChanged) configureGrid(definition);
            void loadSummaryScene(id, run);
            return {
              items: records.records,
              total: safeGridTotal(records.total),
            };
          } catch (error) {
            if (run !== serial) return latestQuery;
            failed.value = true;
            throw error;
          }
        })();
        return latestQuery;
      },
    },
  },
  sortConfig: {
    remote: true,
    multiple: false,
    defaultSort: { field: 'id', order: 'desc' },
  },
  toolbarConfig: {
    custom: true,
    refresh: true,
    refreshOptions: { code: 'query' },
    zoom: true,
    search: true,
  },
};
const [Grid, gridApi] = useVbenVxeGrid<FormRecordRow>({
  gridOptions,
  formOptions: {
    showCollapseButton: true,
    submitOnEnter: true,
    schema: [
      {
        fieldName: 'filterField',
        component: 'Select',
        label: '查询字段',
        componentProps: { options: [], clearable: true },
      },
      {
        fieldName: 'filterValue',
        component: 'Input',
        label: '查询内容',
        hide: true,
      },
    ],
    handleValuesChange: async (values) => {
      const key = String(values.filterField || '');
      if (key === filterField.value) return;
      filterField.value = key;
      const field = runtime.value?.schema.fields.find(
        (entry) => entry.fieldKey === key && entry.searchable,
      );
      await gridApi.formApi.updateSchema([
        {
          fieldName: 'filterValue',
          ...(field ? fieldControl(field) : { component: 'Input' as const }),
          label: field?.label || '查询内容',
          hide: !field,
        },
      ]);
      await gridApi.formApi.setFieldValue('filterValue', undefined);
    },
    handleSubmit: async () => {
      const values = await gridApi.formApi.getValues();
      gridApi.formApi.setLatestSubmissionValues(values);
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query(values);
    },
    handleReset: async () => {
      await gridApi.formApi.resetForm();
      const values = await gridApi.formApi.getValues();
      gridApi.formApi.setLatestSubmissionValues(values);
      await gridApi.grid.clearSort();
      // eslint-disable-next-line unicorn/no-array-sort -- Native Vxe header API.
      await gridApi.grid.sort({ field: 'id', order: 'desc' });
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query(values);
    },
  },
});
function configureGrid(definition: RuntimeDefinition) {
  gridApi.setGridOptions({
    columns: [
      { field: 'id', title: '编号', minWidth: 100, sortable: true },
      ...definition.schema.fields
        .filter((field) => field.listVisible)
        .map((field) => ({
          field: `data.${field.fieldKey}`,
          title: field.label,
          minWidth: 160,
          sortable: field.type !== 'multiselect',
          formatter: ({ row }: { row: FormRecordRow }) =>
            displayValue(field, row.data[field.fieldKey]),
        })),
      { field: 'schemaVersion', title: '填写版本', width: 110, sortable: true },
      { field: 'updateTime', title: '更新时间', minWidth: 180, sortable: true },
      {
        title: '操作',
        field: 'actions',
        fixed: 'right',
        width: 250,
        slots: { default: 'actions' },
      },
    ],
  });
  void gridApi.formApi.updateSchema([
    {
      fieldName: 'filterField',
      componentProps: {
        options: definition.schema.fields
          .filter((field) => field.searchable)
          .map((field) => ({ label: field.label, value: field.fieldKey })),
        clearable: true,
      },
    },
  ]);
}
async function loadSummaryScene(id: string, run: number) {
  summaryScene.value = null;
  if (
    !can('query') ||
    !access.accessCodes.includes('ai:scene:invoke') ||
    import.meta.env.VITE_APP_DEMO === 'true'
  )
    return;
  try {
    const scene = await recordSummaryScene(id);
    if (run === serial && String(route.params.formId) === id)
      summaryScene.value = scene;
  } catch {
    /* Optional AI capability is independent of record browsing. */
  }
}
async function load() {
  refreshVersion++;
  await gridApi.query();
}
const [RecordForm, recordFormApi] = useVbenForm({
  schema: [],
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1',
  handleValuesChange: (values) => {
    data.value = values;
  },
});
const [RecordModal, recordModalApi] = useVbenModal({
  title: '记录',
  class: 'w-[min(760px,94vw)]',
  closeOnClickModal: false,
  destroyOnClose: false,
  onOpenChange: (opened) => {
    dialog.value = opened;
  },
  onBeforeClose: () => !saving.value,
  onConfirm: () => save(),
});
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
  await recordFormApi.setFieldValue(fieldKey, text);
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
    recordFormApi.setState({
      schema: recordFormSchema(record?.schema ?? form.schema),
      commonConfig: { disabled: readOnly },
    });
    const title = record ? '编辑记录' : '新增记录';
    recordModalApi.setState({
      title: readOnly ? '记录详情' : title,
      showConfirmButton: !readOnly,
      confirmText: '保存记录',
    });
    dialog.value = true;
    recordModalApi.open();
    await nextTick();
    if (!readOnly) await recordFormApi.resetForm({ values });
    if (!current()) {
      recordModalApi.close();
      return;
    }
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
  const run = editorSerial;
  const form = runtime.value;
  const record = selected.value;
  const allowed = () =>
    run === editorSerial &&
    dialog.value &&
    !detail.value &&
    runtime.value === form &&
    (record ? can('query') && can('edit') : can('add'));
  if (
    !form ||
    !allowed() ||
    saving.value ||
    (selected.value ? !can('edit') : !can('add'))
  )
    return;
  const validation = await recordFormApi.validate();
  if (!validation.valid || !allowed()) return;
  const values = await recordFormApi.getValues<Record<string, FieldValue>>();
  if (!allowed() || saving.value) return;
  data.value = values;
  const error = dataError(editorSchema.value, data.value);
  if (error) {
    ElMessage.warning(error);
    return;
  }
  saving.value = true;
  recordModalApi.lock();
  saveFailed.value = false;
  try {
    const input = {
      schemaVersion: record?.schemaVersion ?? form.schemaVersion,
      revision: record?.revision,
      data: structuredClone(toRaw(values)),
    };
    await (record
      ? updateRecord(form.id, record.id, input)
      : addRecord(form.id, input));
    if (!allowed()) return;
    saving.value = false;
    recordModalApi.unlock();
    recordModalApi.close();
    ElMessage.success('记录已保存');
    await load();
  } catch {
    if (allowed()) saveFailed.value = true;
  } finally {
    if (run === editorSerial) {
      saving.value = false;
      recordModalApi.unlock();
    }
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
      saving.value = false;
      recordModalApi.unlock();
      recordModalApi.close();
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
  (_value, previous) => {
    serial++;
    latestQuery = Promise.resolve({ items: [], total: 0 });
    filterField.value = '';
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
    saving.value = false;
    recordModalApi.unlock();
    recordModalApi.close();
    if (previous !== undefined) {
      void gridApi.grid.setCurrentPage(1).then(() => gridApi.query());
    }
  },
  { immediate: true },
);
</script>
<template>
  <Page
    :title="runtime ? `${runtime.name} · 数据` : '表单数据'"
    auto-content-height
  >
    <el-alert
      v-if="!can('list')"
      title="没有数据列表权限"
      type="warning"
      closable
    />
    <template v-else>
      <el-alert
        v-if="failed"
        title="数据加载失败"
        type="error"
        closable
        class="mb-3"
      >
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
      <Grid table-title="表单记录">
        <template #toolbar-actions>
          <el-button
            v-if="can('add') && runtime?.status === 'enabled'"
            type="primary"
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
        </template>
        <template #actions="{ row }">
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
      </Grid>
    </template>
    <RecordModal>
      <el-alert
        v-if="saveFailed"
        title="保存未成功，输入已保留。版本冲突时请重新读取。"
        type="error"
        closable
        class="mb-3"
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
      <RecordForm v-if="!detail" />
    </RecordModal>
    <AiSummaryDialog
      v-if="summaryRecord && summaryScene && runtime"
      v-model="summaryOpen"
      :scene-key="summaryScene.sceneKey"
      :form-id="runtime.id"
      :record-id="summaryRecord.id"
      :fields="summaryRecord.schema.fields"
      :writable="can('query') && can('edit')"
      @adopt="adoptSummary"
      @conversation="
        router.push({ path: '/ai/requests', query: { conversation: $event } })
      "
    />
  </Page>
</template>
