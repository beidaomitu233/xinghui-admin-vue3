<script lang="ts" setup>
import type {
  AiModelChange,
  AiModelConfig,
  ModelTestResult,
} from '#/api/system/ai-model';

import { onBeforeUnmount, reactive, ref, watch } from 'vue';

import { Loading, Page, useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenForm, z } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  createAiModel,
  getAiModel,
  listAiModels,
  removeAiModel,
  saveAiModelCredential,
  setAiModelEnabled,
  testAiModel,
  updateAiModel,
} from '#/api/system/ai-model';

const accessStore = useAccessStore();
const can = (permission: string) =>
  accessStore.accessCodes.includes(permission);
const failed = ref(false);
const saving = ref(false);
const statusChangingId = ref<AiModelConfig['id']>();
const dialogVisible = ref(false);
const detailVisible = ref(false);
const editing = ref<AiModelConfig>();
const detail = ref<AiModelConfig>();
const credentialVisible = ref(false);
const credentialTarget = ref<AiModelConfig>();
const credentialSaving = ref(false);
const credentialForm = reactive({
  mode: 'DB' as 'DB' | 'ENV',
  apiKey: '',
  clearKey: false,
});
const testVisible = ref(false);
const testResult = ref<ModelTestResult>();
const testingId = ref<AiModelConfig['id']>();
const form = reactive({
  providerCode: '',
  modelCode: '',
  endpointUrl: '',
  credentialEnvName: '',
  timeoutSeconds: 30,
});
const [EditForm, editFormApi] = useVbenForm({
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1',
  commonConfig: { componentProps: { class: 'w-full' }, labelWidth: 120 },
  schema: [
    {
      component: 'Input',
      fieldName: 'providerCode',
      label: '供应方标识',
      rules: z.string().trim().min(1).max(64),
      componentProps: { maxlength: 64, placeholder: '如 openai' },
    },
    {
      component: 'Input',
      fieldName: 'modelCode',
      label: '模型代号',
      rules: z.string().trim().min(1).max(128),
      componentProps: { maxlength: 128, placeholder: '如 gpt-4.1-mini' },
    },
    {
      component: 'Input',
      fieldName: 'endpointUrl',
      label: 'HTTPS 服务端点',
      rules: z.string().trim().url().startsWith('https://').max(2048),
      componentProps: {
        maxlength: 2048,
        placeholder: 'https://api.example.com/v1',
      },
    },
    {
      component: 'Input',
      fieldName: 'credentialEnvName',
      label: '凭据环境变量名',
      componentProps: { maxlength: 128, placeholder: '如 OPENAI_API_KEY' },
    },
    {
      component: 'InputNumber',
      fieldName: 'timeoutSeconds',
      label: '超时（秒）',
      defaultValue: 30,
      rules: z.number().int().min(1).max(300),
      componentProps: { min: 1, max: 300 },
    },
  ],
});
const [CredentialForm, credentialFormApi] = useVbenForm({
  showDefaultActions: false,
  layout: 'vertical',
  wrapperClass: 'grid-cols-1',
  commonConfig: {
    componentProps: () => ({
      class: 'w-full',
      disabled: credentialSaving.value,
    }),
  },
  schema: [
    {
      component: 'Select',
      fieldName: 'mode',
      label: '密钥来源',
      defaultValue: 'ENV',
      componentProps: {
        options: [
          { label: '加密数据库', value: 'DB' },
          { label: '环境变量引用', value: 'ENV' },
        ],
      },
    },
    {
      component: 'Input',
      fieldName: 'apiKey',
      label: 'API Key',
      description: () =>
        credentialTarget.value?.credentialConfigured ? '已配置' : '未配置',
      dependencies: {
        triggerFields: ['mode'],
        if: (values) => values.mode === 'DB',
      },
      componentProps: {
        type: 'password',
        showPassword: true,
        autocomplete: 'new-password',
        placeholder: '留空保持原密钥',
        maxlength: 8192,
      },
    },
    {
      component: 'Checkbox',
      fieldName: 'clearKey',
      label: '明确清除数据库密钥',
      defaultValue: false,
    },
  ],
});

let listGeneration = 0;
let refreshRevision = 0;
let listResult = { items: [] as AiModelConfig[], total: 0 };
const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() || undefined : undefined;
const booleanFilter = (value: unknown) => {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return undefined;
};
const queryFilters = (values: Record<string, unknown>) => ({
  providerCode: text(values.providerCode),
  modelCode: text(values.modelCode),
  enabled: booleanFilter(values.enabled),
});
const queryParameters = (
  page: { currentPage: number; pageSize: number },
  sort: { field?: string; order?: null | string },
  values: Record<string, unknown>,
) => ({
  pageNum: page.currentPage,
  pageSize: page.pageSize,
  ...queryFilters(values),
  ...(sort.order === 'asc' || sort.order === 'desc'
    ? { orderBy: sort.field, order: sort.order as 'asc' | 'desc' }
    : {}),
});
type GridQuery = {
  page: { currentPage: number; pageSize: number };
  sort: { field: string; order: 'asc' | 'desc' | null };
};
const [Grid, gridApi] = useVbenVxeGrid<AiModelConfig>({
  formOptions: {
    handleSubmit: async (values) => {
      gridApi.formApi.setLatestSubmissionValues(values);
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query();
    },
    showCollapseButton: true,
    collapsedRows: 1,
    handleReset: async () => {
      await gridApi.formApi.resetForm();
      await gridApi.grid.clearSort();
      gridApi.formApi.setLatestSubmissionValues(
        await gridApi.formApi.getValues(),
      );
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query();
    },
    schema: [
      {
        component: 'Input',
        fieldName: 'providerCode',
        label: '供应方',
        componentProps: {
          clearable: true,
          maxlength: 64,
          placeholder: '如 openai',
        },
      },
      {
        component: 'Input',
        fieldName: 'modelCode',
        label: '模型代号',
        componentProps: {
          clearable: true,
          maxlength: 128,
          placeholder: '精确匹配',
        },
      },
      {
        component: 'Select',
        fieldName: 'enabled',
        label: '状态',
        componentProps: {
          clearable: true,
          options: [
            { label: '启用', value: 'true' },
            { label: '停用', value: 'false' },
          ],
        },
      },
    ],
  },
  gridOptions: {
    rowConfig: { keyField: 'id' },
    columns: [
      { field: 'providerCode', title: '供应方', minWidth: 130, sortable: true },
      { field: 'modelCode', title: '模型代号', minWidth: 180, sortable: true },
      { field: 'endpointUrl', title: '服务端点', minWidth: 220 },
      { title: '凭据', minWidth: 160, slots: { default: 'credential' } },
      {
        field: 'timeoutSeconds',
        title: '超时（秒）',
        width: 130,
        sortable: true,
      },
      {
        field: 'enabled',
        title: '状态',
        width: 100,
        sortable: true,
        slots: { default: 'enabled' },
      },
      {
        title: '操作',
        minWidth: 300,
        fixed: 'right',
        slots: { default: 'actions' },
      },
    ],
    pagerConfig: { pageSize: 10, pageSizes: [10, 20, 50, 100] },
    sortConfig: { remote: true },
    toolbarConfig: {
      refresh: true,
      refreshOptions: { code: 'query' },
      custom: true,
      search: true,
    },
    proxyConfig: {
      sort: true,
      ajax: {
        query: async (
          { page, sort }: GridQuery,
          values: Record<string, unknown>,
        ) => {
          const generation = ++listGeneration;
          failed.value = false;
          if (!can('ai:model:list'))
            return (listResult = { items: [], total: 0 });
          try {
            let observedRefresh = refreshRevision;
            let parameters = queryParameters(page, sort, values);
            let result: Awaited<ReturnType<typeof listAiModels>> | undefined;
            for (;;) {
              let failure: unknown;
              try {
                result = await listAiModels(parameters);
              } catch (error_) {
                failure = error_;
              }
              if (generation !== listGeneration) return listResult;
              // 本仓 Vxe 在 loading 中忽略新的 query；返回前以原生页码、表头和最近提交值接续。
              if (gridApi.grid.getCurrentPage) {
                const submitted = gridApi.formApi.getLatestSubmissionValues();
                if (
                  JSON.stringify(queryFilters(submitted)) !==
                  JSON.stringify(queryFilters(parameters))
                )
                  await gridApi.grid.setCurrentPage(1);
                const current = queryParameters(
                  {
                    currentPage: gridApi.grid.getCurrentPage(),
                    pageSize: gridApi.grid.getPageSize(),
                  },
                  gridApi.grid.getSortColumns()[0] ?? {},
                  submitted,
                );
                if (
                  JSON.stringify(current) !== JSON.stringify(parameters) ||
                  observedRefresh !== refreshRevision
                ) {
                  parameters = current;
                  observedRefresh = refreshRevision;
                  continue;
                }
              }
              if (failure) throw failure;
              if (!result) throw new Error('列表未返回结果');
              break;
            }

            if (generation !== listGeneration || !can('ai:model:list'))
              return listResult;
            const total = Number(result.total);
            if (!Number.isSafeInteger(total) || total < 0)
              throw new Error('Invalid total');
            listResult = { items: result.records, total };
            return listResult;
          } catch (error) {
            if (generation !== listGeneration) return listResult;
            failed.value = true;
            listResult = { items: [], total: 0 };
            throw error;
          }
        },
      },
    },
  },
});
const load = () => {
  ++refreshRevision;
  return gridApi.query();
};
watch(
  () => can('ai:model:list'),
  () => {
    ++listGeneration;
    listResult = { items: [], total: 0 };
    gridApi.grid?.loadData?.([]);
    void gridApi.grid?.setCurrentPage?.(1)?.then(() => gridApi.query());
  },
);
onBeforeUnmount(() => {
  ++listGeneration;
});

const [EditModal, editModalApi] = useVbenModal({
  onBeforeClose: () => !saving.value,
  onOpenChange: (open) => {
    dialogVisible.value = open;
  },
});
const [DetailModal, detailModalApi] = useVbenModal({
  onOpenChange: (open) => {
    detailVisible.value = open;
  },
});
const [CredentialModal, credentialModalApi] = useVbenModal({
  onBeforeClose: () => !credentialSaving.value,
  onOpenChange: (open) => {
    credentialVisible.value = open;
  },
  onClosed: () => {
    credentialForm.apiKey = '';
  },
});
const [TestModal, testModalApi] = useVbenModal({
  footer: false,
  onOpenChange: (open) => {
    testVisible.value = open;
  },
});
watch(dialogVisible, (open) =>
  open ? editModalApi.open() : editModalApi.setState({ isOpen: false }),
);
watch(detailVisible, (open) =>
  open ? detailModalApi.open() : void detailModalApi.close(),
);
watch(credentialVisible, (open) =>
  open
    ? credentialModalApi.open()
    : credentialModalApi.setState({ isOpen: false }),
);
watch(credentialVisible, (open) => {
  if (!open) void credentialFormApi.setFieldValue('apiKey', '', false);
});
watch(testVisible, (open) =>
  open ? testModalApi.open() : void testModalApi.close(),
);

function openCreate() {
  editing.value = undefined;
  Object.assign(form, {
    providerCode: '',
    modelCode: '',
    endpointUrl: '',
    credentialEnvName: '',
    timeoutSeconds: 30,
  });
  dialogVisible.value = true;
  void editFormApi.setValues(form);
}

async function openEdit(row: AiModelConfig) {
  let latest = row;
  if (can('ai:model:query')) {
    try {
      latest = await getAiModel(row.id);
    } catch {
      return;
    }
  }
  editing.value = latest;
  Object.assign(form, {
    providerCode: latest.providerCode,
    modelCode: latest.modelCode,
    endpointUrl: latest.endpointUrl,
    credentialEnvName: latest.credentialEnvName ?? '',
    timeoutSeconds: latest.timeoutSeconds,
  });
  dialogVisible.value = true;
  void editFormApi.setValues(form);
}

async function showDetail(row: AiModelConfig) {
  try {
    detail.value = await getAiModel(row.id);
    detailVisible.value = true;
  } catch {
    // The shared request interceptor shows the service error.
  }
}

async function save() {
  if (saving.value) return;
  const validation = await editFormApi.validate();
  if (!validation.valid) return;
  const values = await editFormApi.getValues();
  if (saving.value) return;
  Object.assign(form, values);
  const data: AiModelChange = {
    providerCode: form.providerCode.trim().toLowerCase(),
    modelCode: form.modelCode.trim(),
    endpointUrl: form.endpointUrl.trim(),
    credentialEnvName: form.credentialEnvName.trim() || null,
    timeoutSeconds: form.timeoutSeconds,
    enabled: editing.value?.enabled ?? true,
  };
  if (!data.providerCode || !data.modelCode || !data.endpointUrl) {
    ElMessage.warning('请填写供应方、模型代号和 HTTPS 服务端点');
    return;
  }

  saving.value = true;
  try {
    await (editing.value
      ? updateAiModel(editing.value.id, {
          ...data,
          revision: editing.value.revision,
        })
      : createAiModel(data));
    dialogVisible.value = false;
    ElMessage.success('模型配置已保存');
    await load();
  } catch {
    // Preserve entered values; the shared request interceptor displays validation errors.
  } finally {
    saving.value = false;
  }
}

async function changeStatus(row: AiModelConfig) {
  const enabled = !row.enabled;
  const action = enabled ? '启用' : '停用';
  try {
    await ElMessageBox.confirm(
      enabled
        ? `确认启用 ${row.providerCode}/${row.modelCode}？`
        : `确认停用 ${row.providerCode}/${row.modelCode}？停用后新业务场景不应再选择此模型。`,
      `${action}模型`,
      { type: 'warning' },
    );
  } catch {
    return;
  }
  statusChangingId.value = row.id;
  try {
    await setAiModelEnabled(row.id, { enabled, revision: row.revision });
    ElMessage.success(`模型已${action}`);
    await load();
  } catch {
    // The shared request interceptor displays the service error.
  } finally {
    statusChangingId.value = undefined;
  }
}

async function remove(row: AiModelConfig) {
  if (row.enabled) {
    ElMessage.warning('请先停用模型，再删除配置');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确定删除停用模型 ${row.providerCode}/${row.modelCode}？被场景引用的模型无法删除。`,
      '删除模型配置',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await removeAiModel(row.id, row.revision);
    ElMessage.success('模型配置已删除');
    await load();
  } catch {
    // Keep the current list and let the shared request interceptor show the conflict.
  }
}

async function openCredential(row: AiModelConfig) {
  try {
    credentialTarget.value = can('ai:model:query')
      ? await getAiModel(row.id)
      : row;
    credentialForm.mode = credentialTarget.value.credentialMode ?? 'ENV';
    credentialForm.apiKey = '';
    credentialForm.clearKey = false;
    credentialVisible.value = true;
    void credentialFormApi.setValues(credentialForm);
  } catch {
    /* The shared interceptor displays the service error. */
  }
}
async function saveCredential() {
  if (
    !credentialTarget.value ||
    credentialSaving.value ||
    !can('ai:model:edit')
  )
    return;
  const values = await credentialFormApi.getValues();
  if (credentialSaving.value) return;
  Object.assign(credentialForm, values);
  credentialSaving.value = true;
  try {
    credentialTarget.value = await saveAiModelCredential(
      credentialTarget.value.id,
      { ...credentialForm, revision: credentialTarget.value.revision },
    );
    credentialForm.apiKey = '';
    credentialForm.clearKey = false;
    credentialVisible.value = false;
    ElMessage.success('模型凭据已保存');
    await load();
  } catch {
    /* Keep input for correction or retry. */
  } finally {
    credentialSaving.value = false;
  }
}
async function runTest(row: AiModelConfig) {
  if (testingId.value !== undefined || !can('ai:model:test')) return;
  testingId.value = row.id;
  testResult.value = undefined;
  testVisible.value = true;
  try {
    testResult.value = await testAiModel(row.id);
  } catch {
    testVisible.value = false;
  } finally {
    testingId.value = undefined;
  }
}
</script>

<template>
  <Page
    header-class="flex-wrap gap-3"
    title="AI模型配置"
    description="配置模型、凭据并测试 OpenRouter 连接。"
  >
    <template #extra>
      <el-button v-if="can('ai:model:add')" type="primary" @click="openCreate">
        新增模型
      </el-button>
    </template>
    <div class="min-w-0 space-y-4">
      <el-alert
        title="密钥不会回显，模型测试会向 OpenRouter 发送一条简短请求。"
        type="info"
        closable
        show-icon
      />
      <el-alert
        v-if="failed"
        title="加载失败，请检查权限或服务状态后重试"
        type="error"
      >
        <el-button link type="primary" @click="load">重新加载</el-button>
      </el-alert>
      <el-empty v-if="!can('ai:model:list')" description="无模型配置查看权限" />
      <Grid v-else>
        <template #credential="{ row }">
          {{
            row.credentialMode === 'DB'
              ? '加密数据库'
              : row.credentialEnvName || '环境变量'
          }}
          · {{ row.credentialConfigured ? '已配置' : '未配置' }}
        </template>
        <template #enabled="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'">
            {{ row.enabled ? '启用' : '停用' }}
          </el-tag>
        </template>
        <template #actions="{ row }">
          <el-button
            v-if="can('ai:model:query')"
            link
            type="primary"
            @click="showDetail(row)"
          >
            详情
          </el-button>
          <el-button
            v-if="can('ai:model:edit')"
            link
            type="primary"
            @click="openEdit(row)"
          >
            编辑
          </el-button>
          <el-button
            v-if="can('ai:model:edit')"
            link
            type="primary"
            @click="openCredential(row)"
          >
            凭据
          </el-button>
          <el-button
            v-if="can('ai:model:test')"
            link
            type="primary"
            :loading="testingId === row.id"
            :disabled="!row.enabled || testingId !== undefined"
            @click="runTest(row)"
          >
            测试模型
          </el-button>
          <el-button
            v-if="can('ai:model:edit')"
            link
            :type="row.enabled ? 'warning' : 'success'"
            :loading="statusChangingId === row.id"
            @click="changeStatus(row)"
          >
            {{ row.enabled ? '停用' : '启用' }}
          </el-button>
          <el-button
            v-if="can('ai:model:remove') && !row.enabled"
            link
            type="danger"
            @click="remove(row)"
          >
            删除
          </el-button>
        </template>
      </Grid>
    </div>

    <EditModal
      :title="editing ? '编辑模型配置' : '新增模型配置'"
      class="w-full max-w-[620px]"
    >
      <el-alert
        class="mb-4"
        title="API Key 请通过列表中的“凭据”入口设置。"
        type="info"
        closable
      />
      <EditForm />
      <template #footer>
        <el-button :disabled="saving" @click="dialogVisible = false">
          取消
        </el-button>
        <el-button type="primary" :loading="saving" @click="save">
          保存
        </el-button>
      </template>
    </EditModal>

    <DetailModal title="模型配置详情" class="w-full max-w-[620px]">
      <el-descriptions v-if="detail" :column="1" border>
        <el-descriptions-item label="供应方">
          {{ detail.providerCode }}
        </el-descriptions-item>
        <el-descriptions-item label="模型代号">
          {{ detail.modelCode }}
        </el-descriptions-item>
        <el-descriptions-item label="服务端点">
          {{ detail.endpointUrl }}
        </el-descriptions-item>
        <el-descriptions-item label="凭据引用">
          {{ detail.credentialEnvName || '未配置' }}
        </el-descriptions-item>
        <el-descriptions-item label="超时">
          {{ detail.timeoutSeconds }} 秒
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          {{ detail.enabled ? '启用' : '停用' }}
        </el-descriptions-item>
        <el-descriptions-item label="版本">
          {{ detail.revision }}
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">
          {{ detail.createTime }}
        </el-descriptions-item>
        <el-descriptions-item label="更新时间">
          {{ detail.updateTime }}
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </DetailModal>

    <CredentialModal
      title="模型凭据"
      class="w-full max-w-[540px]"
      :close-on-click-modal="!credentialSaving"
      :close-on-press-escape="!credentialSaving"
    >
      <CredentialForm />
      <template #footer>
        <el-button
          :disabled="credentialSaving"
          @click="credentialVisible = false"
        >
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="credentialSaving"
          @click="saveCredential"
        >
          保存凭据
        </el-button>
      </template>
    </CredentialModal>
    <TestModal title="模型测试结果" class="w-full max-w-[620px]">
      <Loading :spinning="testingId !== undefined" text="正在等待供应方响应…" />
      <el-descriptions v-if="testResult" :column="1" border>
        <el-descriptions-item label="结果">
          {{ testResult.message }}（{{ testResult.outcome }}）
        </el-descriptions-item>
        <el-descriptions-item label="指定模型">
          {{ testResult.model }}
        </el-descriptions-item>
        <el-descriptions-item label="返回模型">
          {{ testResult.returnedModel || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="耗时">
          {{ testResult.elapsedMs }} ms
        </el-descriptions-item>
        <el-descriptions-item label="HTTP状态">
          {{ testResult.httpStatus || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="供应方请求ID">
          {{ testResult.providerId || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="文本">
          <pre class="whitespace-pre-wrap">{{ testResult.content || '-' }}</pre>
        </el-descriptions-item>
      </el-descriptions>
    </TestModal>
  </Page>
</template>
