<script setup lang="ts">
import type { RequestStatus } from '#/api/system/ai-application';
import type {
  RequestAttempt,
  RequestLogDetail,
  RequestLogFilters,
  RequestLogRow,
  RequestLogStatistics,
  RequestStage,
} from '#/api/system/ai-request-log';

import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  ref,
  watch,
} from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage } from 'element-plus';

import { useVbenForm } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  exportRequestLogs,
  getRequestLog,
  listRequestLogs,
  requestLogStatistics,
} from '#/api/system/ai-request-log';

const props = defineProps<{
  appId?: string;
  controlledFilters?: RequestLogFilters;
}>();
const access = useAccessStore();
const can = (action: string) =>
  access.accessCodes.includes(`ai:request:${action}`);
const canAudit = computed(() => can('audit'));
const filters = ref<RequestLogFilters>({ appId: props.appId, scope: 'OWN' });
const effectiveScope = computed(
  () => props.controlledFilters?.scope ?? filters.value.scope,
);
const dates = ref<Date[] | null>(null);
const rows = ref<RequestLogRow[]>([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(20);
const stats = ref<RequestLogStatistics>();
const loading = ref(false);
const exporting = ref(false);
const error = ref('');
const detailOpen = ref(false);
const detail = ref<RequestLogDetail>();
const detailLoading = ref(false);
const sorting = ref<{ order?: 'asc' | 'desc'; orderBy?: string }>({});
let serial = 0;
let detailSerial = 0;
let exportGeneration = 0;
let inactive = false;
function invalidateExport() {
  exportGeneration++;
  exporting.value = false;
}
const statuses: RequestStatus[] = [
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'INCOMPLETE',
  'TIMED_OUT',
];
const labels: Record<RequestStatus, string> = {
  QUEUED: '排队中',
  RUNNING: '生成中',
  SUCCEEDED: '成功',
  FAILED: '失败',
  CANCELLED: '取消',
  INCOMPLETE: '未完成',
  TIMED_OUT: '超时',
};
const snapshot = (): RequestLogFilters =>
  props.controlledFilters
    ? { ...props.controlledFilters }
    : {
        ...filters.value,
        from: dates.value?.[0]?.toISOString(),
        to: dates.value?.[1]?.toISOString(),
      };

async function load() {
  if (!can('list')) return;
  const run = ++serial;
  loading.value = true;
  error.value = '';
  const query = snapshot();
  try {
    const [page, statistics] = await Promise.all([
      listRequestLogs({
        ...query,
        ...sorting.value,
        pageNum: pageNum.value,
        pageSize: pageSize.value,
      }),
      props.controlledFilters
        ? Promise.resolve(undefined)
        : requestLogStatistics(query),
    ]);
    if (run !== serial) return;
    rows.value = page.records;
    const count = Number(page.total);
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error('Invalid total');
    total.value = count;
    stats.value = statistics;
  } catch {
    if (run === serial) {
      rows.value = [];
      stats.value = undefined;
      total.value = 0;
      error.value = '日志读取失败，请重试。';
    }
  } finally {
    if (run === serial) loading.value = false;
  }
}
let submittedRevision = 0;
async function search() {
  ++submittedRevision;
  if (!gridApi.grid.setCurrentPage) return;
  pageNum.value = 1;
  await gridApi.grid?.setCurrentPage?.(1);
  await gridApi.query();
}
async function open(row: RequestLogRow) {
  if (!can('query')) return;
  const run = ++detailSerial;
  detail.value = undefined;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const result = await getRequestLog(row.request.requestId, snapshot());
    if (run === detailSerial) detail.value = result;
  } catch {
    if (run === detailSerial) {
      detailOpen.value = false;
      error.value = '详情读取失败。';
    }
  } finally {
    if (run === detailSerial) detailLoading.value = false;
  }
}
async function download() {
  if (
    !can('export') ||
    exporting.value ||
    inactive ||
    (snapshot().scope === 'AUDIT' && !canAudit.value)
  )
    return;
  const generation = ++exportGeneration;
  const query = snapshot();
  const range = JSON.stringify(query);
  const session = access.accessToken;
  exporting.value = true;
  try {
    const records = await exportRequestLogs(query);
    if (
      generation !== exportGeneration ||
      inactive ||
      !can('export') ||
      access.accessToken !== session ||
      JSON.stringify(snapshot()) !== range ||
      (query.scope === 'AUDIT' && !canAudit.value)
    )
      return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(records, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-requests-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ElMessage.success('日志已导出');
  } catch {
    if (generation === exportGeneration && !inactive)
      error.value = '导出失败，请缩小范围或重试。';
  } finally {
    if (generation === exportGeneration && !inactive) exporting.value = false;
  }
}
const [QueryForm, formApi] = useVbenForm({
  submitButtonOptions: { content: '查询' },
  showCollapseButton: true,
  collapsedRows: 1,
  commonConfig: { componentProps: { class: 'w-full' } },
  handleSubmit: search,
  handleReset: async () => {
    await formApi.resetForm();
    await formApi.setValues({ scope: 'OWN', appId: props.appId });
    sorting.value = {};
    await gridApi.grid.clearSort();
    search();
  },
  handleValuesChange: (values) => {
    const { dates: range, ...fields } = values;
    dates.value = range ?? null;
    filters.value = {
      ...fields,
      scope: fields.scope ?? 'OWN',
      appId: props.appId || fields.appId,
      tenantRef: fields.scope === 'AUDIT' ? fields.tenantRef : undefined,
      subjectRef: fields.scope === 'AUDIT' ? fields.subjectRef : undefined,
    };
  },
  schema: [
    {
      component: 'Select',
      fieldName: 'scope',
      label: '范围',
      defaultValue: 'OWN',
      componentProps: () => ({
        options: [
          { label: '本人', value: 'OWN' },
          ...(canAudit.value ? [{ label: '平台审计', value: 'AUDIT' }] : []),
        ],
      }),
    },
    {
      component: 'Input',
      fieldName: 'appId',
      label: '应用 ID',
      componentProps: () => ({
        disabled: !!props.appId,
        maxlength: 19,
        clearable: true,
      }),
    },
    ...[
      ['requestId', '请求 ID'],
      ['businessId', '业务记录'],
      ['modelRef', '模型引用'],
    ].map(([fieldName, label]) => ({
      component: 'Input' as const,
      fieldName: fieldName!,
      label,
      componentProps: { clearable: true, maxlength: 128 },
    })),
    {
      component: 'Select',
      fieldName: 'status',
      label: '状态',
      componentProps: {
        clearable: true,
        options: statuses.map((value) => ({ value, label: labels[value] })),
      },
    },
    ...[
      ['tenantRef', '租户'],
      ['subjectRef', '主体'],
    ].map(([fieldName, label]) => ({
      component: 'Input' as const,
      fieldName: fieldName!,
      label,
      dependencies: {
        triggerFields: ['scope'],
        if: (values: Record<string, unknown>) => values.scope === 'AUDIT',
      },
    })),
    {
      component: 'DatePicker',
      fieldName: 'dates',
      label: '时间',
      componentProps: {
        type: 'datetimerange',
        startPlaceholder: '开始',
        endPlaceholder: '结束',
      },
    },
  ],
});
type GridQuery = {
  page: { currentPage: number; pageSize: number };
  sort: { field: string; order: 'asc' | 'desc' | null };
};
const [Grid, gridApi] = useVbenVxeGrid<RequestLogRow>({
  gridOptions: {
    columns: [
      {
        title: '请求 ID',
        minWidth: 120,
        field: 'request.requestId',
        sortable: true,
      },
      { title: '场景 / 历史应用', minWidth: 140, field: 'appName' },
      { title: '版本', width: 100, slots: { default: 'cell2' } },
      { title: '业务记录', minWidth: 140, field: 'request.businessId' },
      {
        title: '状态',
        width: 100,
        field: 'request.status',
        sortable: true,
        slots: { default: 'cell4' },
      },
      { title: '阶段', width: 110, field: 'request.stage', sortable: true },
      { title: '耗时', width: 100, slots: { default: 'cell6' } },
      {
        title: '尝试',
        width: 80,
        field: 'request.attemptCount',
        sortable: true,
      },
      {
        title: '输入 / 输出 Token',
        minWidth: 150,
        slots: { default: 'cell8' },
      },
      {
        title: '租户',
        minWidth: 100,
        field: 'tenantRef',
        visible: effectiveScope.value === 'AUDIT',
      },
      {
        title: '主体',
        minWidth: 100,
        field: 'subjectRef',
        visible: effectiveScope.value === 'AUDIT',
      },
      { title: '安全分类', minWidth: 150, field: 'request.errorCode' },
      {
        title: '操作',
        width: 96,
        fixed: 'right',
        visible: true,
        slots: { default: 'cell12' },
      },
    ],
    pagerConfig: { pageSize: 20, pageSizes: [10, 20, 50, 100] },
    sortConfig: { remote: true },
    toolbarConfig: {
      refresh: true,
      refreshOptions: { code: 'query' },
      custom: true,
    },
    proxyConfig: {
      sort: true,
      ajax: {
        query: async ({ page, sort }: GridQuery) => {
          pageNum.value = page.currentPage;
          pageSize.value = page.pageSize;
          sorting.value = sort.order
            ? {
                orderBy: sort.field.replace(/^request\./, ''),
                order: sort.order as 'asc' | 'desc',
              }
            : {};
          let revision = submittedRevision;
          for (;;) {
            const requested = JSON.stringify({
              page: pageNum.value,
              size: pageSize.value,
              sort: sorting.value,
              revision,
            });
            await load();
            if (gridApi.grid.getCurrentPage) {
              if (revision !== submittedRevision)
                await gridApi.grid.setCurrentPage(1);
              const currentSort = gridApi.grid.getSortColumns()[0];
              const order = currentSort?.order;
              sorting.value =
                currentSort && (order === 'asc' || order === 'desc')
                  ? {
                      orderBy: currentSort.field.replace(/^request\./, ''),
                      order,
                    }
                  : {};
              pageNum.value = gridApi.grid.getCurrentPage();
              pageSize.value = gridApi.grid.getPageSize();
              revision = submittedRevision;
              if (
                requested !==
                JSON.stringify({
                  page: pageNum.value,
                  size: pageSize.value,
                  sort: sorting.value,
                  revision,
                })
              )
                continue;
            }
            break;
          }
          return { items: rows.value, total: total.value };
        },
      },
    },
  },
});
const [StagesGrid, stagesGridApi] = useVbenVxeGrid<RequestStage>({
  gridOptions: {
    columns: [
      { title: '阶段', width: 100, field: 'stage', sortable: true },
      { title: '结果', width: 130, field: 'outcome', sortable: true },
      { title: '引用类型', width: 110, field: 'referenceKind', sortable: true },
      { title: '引用 ID', minWidth: 120, field: 'referenceId' },
      {
        title: '引用版本',
        minWidth: 120,
        field: 'referenceVersion',
        sortable: true,
      },
      { title: '分类', minWidth: 140, field: 'errorCode', sortable: true },
      { title: '时间', minWidth: 180, field: 'createdAt', sortable: true },
    ],
    pagerConfig: { enabled: false },
    proxyConfig: { enabled: false },
    toolbarConfig: { custom: true },
  },
});
watch(
  () => detail.value?.stages ?? [],
  (data) => stagesGridApi.setGridOptions({ data }),
  { immediate: true },
);
const [AttemptsGrid, attemptsGridApi] = useVbenVxeGrid<RequestAttempt>({
  gridOptions: {
    columns: [
      { title: '次数', width: 70, field: 'number', sortable: true },
      {
        title: '实际提供商 / 模型',
        minWidth: 180,
        slots: { default: 'cell1' },
      },
      {
        title: '配置版本',
        minWidth: 110,
        field: 'configVersion',
        sortable: true,
      },
      { title: '脱敏 Key', minWidth: 130, field: 'maskedKeyLabel' },
      { title: 'Key 版本', minWidth: 100, slots: { default: 'cell4' } },
      {
        title: '选择原因',
        minWidth: 130,
        field: 'switchReason',
        sortable: true,
      },
      { title: '终态', minWidth: 110, field: 'status', sortable: true },
      { title: '输出配额', width: 100, slots: { default: 'cell7' } },
      { title: '输入 / 输出', minWidth: 120, slots: { default: 'cell8' } },
      { title: '上游追踪 ID', minWidth: 180, slots: { default: 'cell9' } },
      { title: '分类', minWidth: 130, field: 'errorCode', sortable: true },
    ],
    pagerConfig: { enabled: false },
    proxyConfig: { enabled: false },
    toolbarConfig: { custom: true },
  },
});
watch(
  () => detail.value?.attempts ?? [],
  (data) => attemptsGridApi.setGridOptions({ data }),
  { immediate: true },
);
watch(effectiveScope, () => {
  gridApi.grid?.hideColumn?.('tenantRef');
  gridApi.grid?.hideColumn?.('subjectRef');
  if (effectiveScope.value === 'AUDIT') {
    gridApi.grid?.showColumn?.('tenantRef');
    gridApi.grid?.showColumn?.('subjectRef');
  }
});
const [DetailModal, detailModalApi] = useVbenModal({
  onOpenChange: (open) => {
    if (!open) {
      detailOpen.value = false;
      detailSerial++;
      detail.value = undefined;
    }
  },
});
watch(detailOpen, (open) => detailModalApi.setState({ isOpen: open }));
watch(detailLoading, (loading) => detailModalApi.setState({ loading }));
watch(
  () => props.appId,
  (appId) => {
    filters.value.appId = appId;
    void formApi.setValues({ appId });
    rows.value = [];
    stats.value = undefined;
    total.value = 0;
    detailSerial++;
    detail.value = undefined;
    detailOpen.value = false;
    if (!props.controlledFilters) search();
  },
  { immediate: true },
);
watch(
  () => props.controlledFilters,
  (value) => {
    if (!value) return;
    serial++;
    detailSerial++;
    invalidateExport();
    rows.value = [];
    stats.value = undefined;
    detail.value = undefined;
    detailOpen.value = false;
    search();
  },
  { deep: true, immediate: true },
);
watch(canAudit, (allowed) => {
  if (!allowed && snapshot().scope === 'AUDIT') {
    serial++;
    detailSerial++;
    loading.value = false;
    total.value = 0;
    rows.value = [];
    stats.value = undefined;
    detail.value = undefined;
    detailOpen.value = false;
    error.value = '审计权限不可用，请选择本人范围。';
  }
});
watch([filters, dates], invalidateExport, { deep: true });
watch(
  () => can('export'),
  (allowed) => {
    if (!allowed) invalidateExport();
  },
);
onActivated(() => {
  inactive = false;
});
onDeactivated(() => {
  inactive = true;
  invalidateExport();
});
onBeforeUnmount(() => {
  inactive = true;
  invalidateExport();
  serial++;
  detailSerial++;
});
</script>

<template>
  <el-alert
    v-if="!can('list')"
    title="没有日志查询权限。"
    type="warning"
    closable
  />
  <template v-else>
    <el-alert
      v-if="!controlledFilters"
      title="默认本人近7天；最长31天。日志不保存正文。"
      type="info"
      closable
      class="mb-3"
    />
    <QueryForm v-if="!controlledFilters" />
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      closable
      class="mb-3"
      @close="error = ''"
    />
    <el-descriptions v-if="stats" :column="3" border class="mb-3">
      <el-descriptions-item label="业务请求 / 应用测试">
        {{ stats.businessRequests }} / {{ stats.testRequests }}
      </el-descriptions-item>
      <el-descriptions-item label="模型尝试">
        {{ stats.modelAttempts }}
      </el-descriptions-item>
      <el-descriptions-item label="已知输入 / 输出 Token">
        {{ stats.knownInputTokens ?? '未知' }} /
        {{ stats.knownOutputTokens ?? '未知' }}
      </el-descriptions-item>
      <el-descriptions-item label="输入 / 输出未知次数">
        {{ stats.unknownInputAttempts }} / {{ stats.unknownOutputAttempts }}
      </el-descriptions-item>
    </el-descriptions>
    <Grid>
      <template #toolbar-actions>
        <el-button v-if="can('export')" :loading="exporting" @click="download">
          导出 JSON
        </el-button>
      </template>
      <template #cell2="{ row }">
        {{
          row.request.sceneVersionId ??
          row.request.appVersionId ??
          `草稿 ${row.request.draftRevision}`
        }}
      </template>
      <template #cell4="{ row }">
        {{ labels[row.request.status as RequestStatus] }}
      </template>
      <template #cell6="{ row }">{{ row.elapsedMs }} ms</template>
      <template #cell8="{ row }">
        {{ row.request.inputTokens ?? '未知' }} /
        {{ row.request.outputTokens ?? '未知' }}
      </template>
      <template #cell12="{ row }">
        <el-button v-if="can('query')" link @click="open(row)">详情</el-button>
      </template>
    </Grid>
    <DetailModal title="请求时间线" class="w-full max-w-[1120px]">
      <template v-if="detail">
        <p class="mb-3 break-all">
          请求 {{ detail.request.request.requestId }} ·
          {{ detail.request.appName }} ·
          {{
            detail.request.request.errorCode ??
            labels[detail.request.request.status]
          }}
        </p>
        <StagesGrid />
        <AttemptsGrid>
          <template #cell1="{ row }">
            {{ row.providerCode ?? '未知' }} / {{ row.modelCode ?? '未知' }}
          </template>
          <template #cell4="{ row }">
            {{ row.keyVersion ?? '未知' }}
          </template>
          <template #cell7="{ row }">
            {{ row.outputTokenLimit ?? '未知' }}
          </template>
          <template #cell8="{ row }">
            {{ row.inputTokens ?? '未知' }} / {{ row.outputTokens ?? '未知' }}
          </template>
          <template #cell9="{ row }">
            {{ row.providerRequestId ?? '未知' }}
          </template>
        </AttemptsGrid>
      </template>
      <template #footer>
        <el-button @click="detailOpen = false">关闭</el-button>
      </template>
    </DetailModal>
  </template>
</template>
