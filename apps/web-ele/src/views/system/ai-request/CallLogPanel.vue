<script setup lang="ts">
import type {
  CallLogFilters,
  CallLogRow,
  CallLogStatistics,
  CallLogDetail as Detail,
} from '#/api/system/ai-call-log';

import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  ref,
  watch,
} from 'vue';

import { Loading, useVbenDrawer } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElAlert, ElButton } from 'element-plus';

import { useVbenForm } from '#/adapter/form';
import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  callLogStatistics,
  exportCallLogs,
  getCallLog,
  listCallLogs,
} from '#/api/system/ai-call-log';

import {
  costValue,
  entryLabels,
  exact,
  localDateTime,
  outputTime,
  statusLabels,
  structuredRows,
  tokenValue,
} from './call-log-format';
import CallLogDetail from './CallLogDetail.vue';

const props = withDefaults(defineProps<{ active?: boolean }>(), {
  active: true,
});
const access = useAccessStore();
const can = (action: string) =>
  access.accessCodes.includes(`ai:request:${action}`);
const filters = ref<CallLogFilters>({ scope: 'OWN' });
const from = ref('');
const to = ref('');
const rows = ref<CallLogRow[]>([]);
const stats = ref<CallLogStatistics>();
const total = ref('0');
const page = ref(1);
const pageSize = ref(20);
const sorting = ref<{ order?: 'asc' | 'desc'; orderBy?: string }>({});
const detail = ref<Detail>();
const detailOpen = ref(false);
const loading = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const queried = ref(false);
const exporting = ref(false);
const error = ref('');
let generation = 0;
let detailGeneration = 0;
let exportGeneration = 0;
const mounted = ref(true);
const enabled = computed(
  () => mounted.value && props.active && !!access.accessToken && can('list'),
);
const query = (): CallLogFilters => ({
  ...filters.value,
  from: from.value ? new Date(from.value).toISOString() : undefined,
  to: to.value ? new Date(to.value).toISOString() : undefined,
});
function clear() {
  generation++;
  detailGeneration++;
  exportGeneration++;
  rows.value = [];
  stats.value = undefined;
  total.value = '0';
  detail.value = undefined;
  detailOpen.value = false;
  loading.value = false;
  detailLoading.value = false;
  detailError.value = '';
  queried.value = false;
  exporting.value = false;
  error.value = '';
  gridApi?.grid?.loadData?.([]);
}
function validDates() {
  const start = from.value ? new Date(from.value).getTime() : null;
  const end = to.value ? new Date(to.value).getTime() : null;
  if (
    (start !== null && !Number.isFinite(start)) ||
    (end !== null && !Number.isFinite(end)) ||
    (start !== null &&
      end !== null &&
      (end < start || end - start > 31 * 86_400_000))
  ) {
    error.value = '请选择先后正确且不超过31日的时间范围。';
    return false;
  }
  return true;
}
async function load() {
  clear();
  if (!enabled.value || !validDates()) return;
  const run = generation;
  loading.value = true;
  try {
    const params = query();
    const [result, counts] = await Promise.all([
      listCallLogs({
        ...params,
        ...sorting.value,
        pageNum: page.value,
        pageSize: pageSize.value,
      }),
      callLogStatistics(params),
    ]);
    if (run !== generation || !enabled.value) return;
    rows.value = result.records;
    queried.value = true;
    total.value = exact(result.total);
    stats.value = counts;
  } catch {
    if (run === generation && enabled.value)
      error.value = '日志读取失败，请重试。';
  } finally {
    if (run === generation) loading.value = false;
  }
}
let submittedRevision = 0;
async function search() {
  ++submittedRevision;
  if (!gridApi.grid.setCurrentPage) return;
  page.value = 1;
  await gridApi.grid?.setCurrentPage?.(1);
  await gridApi.query();
}
async function open(row: CallLogRow) {
  if (!enabled.value || !can('query')) return;
  const run = ++detailGeneration;
  const epoch = generation;
  detail.value = undefined;
  detailError.value = '';
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    const result = await getCallLog(row.callId, query());
    if (
      run !== detailGeneration ||
      epoch !== generation ||
      !enabled.value ||
      !can('query')
    )
      return;
    detail.value = {
      call: result.call,
      response: result.call.responseAvailable ? result.response : null,
    };
  } catch {
    if (run === detailGeneration && epoch === generation)
      detailError.value = '详情读取失败，请关闭后重试。';
  } finally {
    if (run === detailGeneration) detailLoading.value = false;
  }
}
function closeDetail() {
  detailGeneration++;
  detail.value = undefined;
  detailOpen.value = false;
  detailLoading.value = false;
}
const [DetailDrawer, drawerApi] = useVbenDrawer({
  title: '交互详情',
  footer: false,
  openAutoFocus: true,
  onOpenChange: (open) => {
    if (!open) closeDetail();
  },
});
watch(detailOpen, (open) => (open ? drawerApi.open() : void drawerApi.close()));

const [QueryForm, formApi] = useVbenForm({
  submitButtonOptions: { content: '查询' },
  showCollapseButton: true,
  collapsedRows: 1,
  wrapperClass: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
  commonConfig: { componentProps: { class: 'w-full' } },
  handleSubmit: search,
  handleReset: async () => {
    await formApi.resetForm();
    sorting.value = {};
    await gridApi.grid.clearSort();
    search();
  },
  handleValuesChange: (values) => {
    const { from: start, to: end, ...fields } = values;
    from.value = start || '';
    to.value = end || '';
    filters.value = {
      ...fields,
      scope: fields.scope ?? 'OWN',
      tenantRef: fields.scope === 'AUDIT' ? fields.tenantRef : undefined,
      subjectRef: fields.scope === 'AUDIT' ? fields.subjectRef : undefined,
    } as CallLogFilters;
  },
  schema: [
    {
      component: 'Select',
      fieldName: 'scope',
      label: '范围',
      defaultValue: 'OWN',
      componentProps: () => ({
        'aria-label': '日志范围',
        options: [
          { label: '我的交互', value: 'OWN' },
          ...(can('audit') ? [{ label: '平台审计', value: 'AUDIT' }] : []),
        ],
      }),
    },
    ...(['from', 'to'] as const).map((fieldName) => ({
      component: 'DatePicker' as const,
      fieldName,
      label: fieldName === 'from' ? '开始' : '结束',
      componentProps: {
        type: 'datetime',
        valueFormat: 'YYYY-MM-DDTHH:mm:ss',
        clearable: true,
      },
    })),
    {
      component: 'Select',
      fieldName: 'entryType',
      label: '类型',
      componentProps: {
        clearable: true,
        options: Object.entries(entryLabels).map(([value, label]) => ({
          value,
          label,
        })),
      },
    },
    {
      component: 'Select',
      fieldName: 'status',
      label: '状态',
      componentProps: {
        clearable: true,
        options: Object.entries(statusLabels).map(([value, label]) => ({
          value,
          label,
        })),
      },
    },
    ...[
      ['requestId', '请求 ID'],
      ['modelRef', '模型 ID'],
      ['providerCode', '供应商'],
      ['appId', '应用 ID'],
      ['sceneKey', '场景'],
    ].map(([fieldName, label]) => ({
      component: 'Input' as const,
      fieldName: fieldName!,
      label,
      componentProps: { clearable: true, 'aria-label': label },
    })),
    ...[
      ['tenantRef', '租户'],
      ['subjectRef', '发起人'],
    ].map(([fieldName, label]) => ({
      component: 'Input' as const,
      fieldName: fieldName!,
      label,
      componentProps: { 'aria-label': label },
      dependencies: {
        triggerFields: ['scope'],
        if: (values: Record<string, unknown>) => values.scope === 'AUDIT',
      },
    })),
  ],
});
type GridQuery = {
  page: { currentPage: number; pageSize: number };
  sort: { field: string; order: 'asc' | 'desc' | null };
};
const [Grid, gridApi] = useVbenVxeGrid<CallLogRow>({
  gridOptions: {
    rowConfig: { keyField: 'callId' },
    columns: [
      {
        field: 'startedAt',
        title: '时间（本地） / 类型',
        minWidth: 190,
        sortable: true,
        slots: { default: 'time' },
      },
      { title: '模型 / 渠道', minWidth: 200, slots: { default: 'model' } },
      {
        field: 'status',
        title: '状态',
        minWidth: 130,
        sortable: true,
        slots: { default: 'status' },
      },
      {
        field: 'inputTokens',
        title: '输入 Token',
        minWidth: 130,
        sortable: true,
        slots: { default: 'input' },
      },
      {
        field: 'outputTokens',
        title: '输出 Token',
        minWidth: 130,
        sortable: true,
        slots: { default: 'output' },
      },
      {
        field: 'elapsedMs',
        title: '总耗时',
        minWidth: 150,
        sortable: true,
        slots: { default: 'duration' },
      },
      {
        field: 'firstOutputMs',
        title: '首输出',
        minWidth: 150,
        sortable: true,
        slots: { default: 'firstOutput' },
      },
      { title: '实报费用', minWidth: 110, slots: { default: 'cost' } },
      {
        title: '操作',
        minWidth: 160,
        fixed: 'right',
        slots: { default: 'actions' },
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
        query: async ({ page: pagination, sort }: GridQuery) => {
          page.value = pagination.currentPage;
          pageSize.value = pagination.pageSize;
          sorting.value = sort.order
            ? { orderBy: sort.field, order: sort.order as 'asc' | 'desc' }
            : {};
          let revision = submittedRevision;
          for (;;) {
            const requested = JSON.stringify({
              page: page.value,
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
                  ? { orderBy: currentSort.field, order }
                  : {};
              page.value = gridApi.grid.getCurrentPage();
              pageSize.value = gridApi.grid.getPageSize();
              revision = submittedRevision;
              if (
                requested !==
                JSON.stringify({
                  page: page.value,
                  size: pageSize.value,
                  sort: sorting.value,
                  revision,
                })
              )
                continue;
            }
            break;
          }
          const count = Number(total.value);
          if (!Number.isSafeInteger(count) || count < 0) {
            rows.value = [];
            error.value = '日志总数超出可安全分页范围，请缩小查询范围。';
            throw new Error('Invalid total');
          }
          return { items: rows.value, total: count };
        },
      },
    },
  },
});
async function sameRequest(requestId: string) {
  filters.value = { ...filters.value, requestId };
  await formApi.setValues({ requestId });
  await search();
}
async function download() {
  if (!enabled.value || !can('export') || exporting.value || !validDates())
    return;
  const run = ++exportGeneration;
  const epoch = generation;
  exporting.value = true;
  try {
    const records = await exportCallLogs(query());
    if (
      run !== exportGeneration ||
      epoch !== generation ||
      !enabled.value ||
      !can('export')
    )
      return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(structuredRows(records), null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ai-call-logs.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    if (run === exportGeneration) error.value = '导出失败，请缩小范围或重试。';
  } finally {
    if (run === exportGeneration) exporting.value = false;
  }
}
let filterFingerprint = JSON.stringify({
  ...filters.value,
  from: from.value,
  to: to.value,
});
watch(
  [filters, from, to],
  () => {
    const fingerprint = JSON.stringify({
      ...filters.value,
      from: from.value,
      to: to.value,
    });
    if (fingerprint === filterFingerprint) return;
    filterFingerprint = fingerprint;
    clear();
    page.value = 1;
  },
  { deep: true, flush: 'sync' },
);
watch(
  () => filters.value.scope,
  () => {
    filters.value.tenantRef = undefined;
    filters.value.subjectRef = undefined;
  },
  { flush: 'sync' },
);
watch(
  () => [
    access.accessToken,
    ...access.accessCodes,
    props.active,
    mounted.value,
  ],
  () => {
    clear();
    filters.value = { scope: 'OWN' };
    from.value = '';
    to.value = '';
    page.value = 1;
    void formApi.resetForm();
    sorting.value = {};
    if (enabled.value) void search();
  },
  { immediate: true, flush: 'sync' },
);
onDeactivated(() => {
  mounted.value = false;
  clear();
});
onActivated(() => {
  mounted.value = true;
});
onBeforeUnmount(clear);
</script>

<template>
  <section class="min-w-0 space-y-4" aria-label="请求日志">
    <el-empty v-if="!can('list')" description="没有请求日志查看权限" />
    <template v-else>
      <p class="text-muted-foreground">
        每行代表一次上游交互，包含连接测试与目录扫描。默认最近7日。
      </p>
      <ElAlert v-if="error" :title="error" type="error" @close="error = ''" />
      <QueryForm />
      <ElAlert
        v-if="filters.scope === 'AUDIT'"
        title="平台审计范围由服务端核验；私有正文仍按原访问权限保护。"
        type="info"
        :closable="false"
      />
      <dl v-if="stats" class="call-stats">
        <div>
          <dt>上游交互</dt>
          <dd>{{ exact(stats.calls) }}</dd>
        </div>
        <div>
          <dt>成功 / 失败</dt>
          <dd>{{ exact(stats.succeeded) }} / {{ exact(stats.failed) }}</dd>
        </div>
        <div>
          <dt>已知输入 Token</dt>
          <dd>{{ exact(stats.knownInputTokens, '未知') }}</dd>
          <small>{{ exact(stats.unknownInputCalls) }} 次输入未知</small>
        </div>
        <div>
          <dt>已知输出 Token</dt>
          <dd>{{ exact(stats.knownOutputTokens, '未知') }}</dd>
          <small>{{ exact(stats.unknownOutputCalls) }} 次输出未知</small>
        </div>
      </dl>
      <Grid>
        <template #toolbar-actions>
          <ElButton
            v-if="can('export')"
            :loading="exporting"
            :disabled="!enabled"
            @click="download"
          >
            导出结构化日志
          </ElButton>
        </template>
        <template #time="{ row }">
          {{ localDateTime(row.startedAt) }}
          <small>
            {{ entryLabels[row.entryType as keyof typeof entryLabels] }}
          </small>
        </template>
        <template #model="{ row }">
          {{ row.modelCode ?? row.returnedModel ?? row.modelRef ?? '未提供' }}
          <small>{{ row.configName ?? row.providerCode ?? '未提供' }}</small>
        </template>
        <template #status="{ row }">
          {{ statusLabels[row.status] ?? row.status }}
          <small v-if="row.errorCode">{{ row.errorCode }}</small>
        </template>
        <template #input="{ row }">
          {{ tokenValue(row, row.inputTokens) }}
        </template>
        <template #output="{ row }">
          {{ tokenValue(row, row.outputTokens) }}
        </template>
        <template #duration="{ row }">
          {{ exact(row.elapsedMs) }}{{ row.elapsedMs === null ? '' : ' ms' }}
        </template>
        <template #firstOutput="{ row }">{{ outputTime(row) }}</template>
        <template #cost="{ row }">{{ costValue(row) }}</template>
        <template #actions="{ row }">
          <ElButton v-if="can('query')" link type="primary" @click="open(row)">
            详情
          </ElButton>
          <ElButton
            v-if="row.requestId"
            link
            type="primary"
            @click="sameRequest(row.requestId)"
          >
            同一请求
          </ElButton>
        </template>
      </Grid>
      <DetailDrawer class="w-full max-w-[680px]">
        <ElAlert
          v-if="detailError"
          :title="detailError"
          type="error"
          @close="detailError = ''"
        />
        <Loading :spinning="detailLoading" text="读取交互详情…">
          <CallLogDetail v-if="detail" :detail="detail" />
        </Loading>
      </DetailDrawer>
    </template>
  </section>
</template>
<style scoped>
small {
  display: block;
  margin-top: 5px;
  color: hsl(var(--muted-foreground));
}
.call-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.call-stats div {
  min-width: 0;
  padding: 14px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}
.call-stats dd {
  margin-top: 8px;
  font-size: 20px;
  overflow-wrap: anywhere;
}
</style>
