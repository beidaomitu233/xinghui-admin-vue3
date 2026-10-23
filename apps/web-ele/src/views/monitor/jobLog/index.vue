<script lang="ts" setup>
import type {
  JobFireFilters,
  JobFireLog,
} from '#/api/monitor/jobLog';

import { computed, ref, watch } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { createVbenGridQuery, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  cleanJobLog,
  getJobLog,
  getJobLogList,
  removeJobLog,
} from '#/api/monitor/jobLog';

const accessStore = useAccessStore();
const can = (code: string) => accessStore.accessCodes.includes(code);
const canQuery = computed(() => can('monitor:jobLog:list'));
const error = ref('');
let queryRevision = 0;

const statuses = [
  { value: 'CLAIMED', label: '执行中' },
  { value: 'SUCCEEDED', label: '成功' },
  { value: 'FAILED', label: '失败' },
  { value: 'SKIPPED', label: '已跳过' },
  { value: 'CANCELLED', label: '已取消' },
];

type TagType = 'danger' | 'info' | 'primary' | 'success' | 'warning';

function statusLabel(value: string) {
  return statuses.find((item) => item.value === value)?.label || value;
}
function statusTag(value: string): TagType {
  const colors: Record<string, TagType> = {
    CANCELLED: 'info',
    CLAIMED: 'warning',
    FAILED: 'danger',
    SKIPPED: 'info',
    SUCCEEDED: 'success',
  };
  return colors[value] ?? 'info';
}

const sortableFields = new Set([
  'attemptCount',
  'completedAt',
  'fireId',
  'jobGroup',
  'jobName',
  'scheduledFireTime',
  'startedAt',
  'status',
  'triggerType',
]);
function logOrdering(
  sort: { field?: unknown; order?: unknown },
): Pick<JobFireFilters, 'order' | 'orderBy'> {
  if (
    typeof sort.field === 'string' &&
    sortableFields.has(sort.field) &&
    (sort.order === 'asc' || sort.order === 'desc')
  ) {
    return {
      orderBy: sort.field as JobFireFilters['orderBy'],
      order: sort.order,
    };
  }
  return { orderBy: 'fireId', order: 'desc' };
}

const queryLogs: () => Promise<{
  items: JobFireLog[];
  total: number;
}> = createVbenGridQuery(
  () => gridApi,
  async ({ page, sort, form }) => {
    if (!canQuery.value) return { items: [], total: 0 };
    const jobId = String(form.jobId ?? '').trim();
    const jobName = String(form.jobName ?? '').trim();
    const status = String(form.status ?? '').trim();
    const triggerType = String(form.triggerType ?? '').trim();
    const result = await getJobLogList({
      pageNum: page.currentPage,
      pageSize: page.pageSize,
      ...(jobId && { jobId }),
      ...(jobName && { jobName }),
      ...(status && { status }),
      ...(triggerType && { triggerType }),
      ...logOrdering(sort),
    });
    return {
      items: result.records ?? [],
      total: Number(result.total) || 0,
    };
  },
  () => JSON.stringify([accessStore.accessToken, canQuery.value, queryRevision]),
);

const [Grid, gridApi] = useVbenVxeGrid<JobFireLog>({
  tableTitle: '执行记录',
  formOptions: {
    collapsed: true,
    submitOnEnter: true,
    schema: [
      { fieldName: 'jobId', label: '任务 ID', component: 'Input', defaultValue: '' },
      { fieldName: 'jobName', label: '任务名称', component: 'Input', defaultValue: '' },
      {
        fieldName: 'status',
        label: '结果',
        component: 'Select',
        componentProps: { clearable: true, options: statuses },
      },
      {
        fieldName: 'triggerType',
        label: '触发',
        component: 'Select',
        componentProps: {
          clearable: true,
          options: [
            { label: '调度', value: 'SCHEDULED' },
            { label: '手动', value: 'MANUAL' },
          ],
        },
      },
    ],
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
      await gridApi.grid.sort({ field: 'fireId', order: 'desc' });
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query(values);
    },
  },
  gridOptions: {
    height: 'auto',
    rowConfig: { keyField: 'fireId' },
    checkboxConfig: { reserve: true, highlight: true },
    columns: [
      { type: 'checkbox', width: 50 },
      { field: 'fireId', title: '记录 ID', width: 100, sortable: true },
      { field: 'jobName', title: '任务名称', minWidth: 150, sortable: true },
      { field: 'jobGroup', title: '任务组', width: 110, sortable: true },
      {
        field: 'triggerType',
        title: '触发',
        width: 90,
        sortable: true,
        formatter: ({ cellValue }: { cellValue: string }) =>
          ({ MANUAL: '手动', SCHEDULED: '调度' })[cellValue] ?? cellValue,
      },
      {
        field: 'scheduledFireTime',
        title: '计划时间（UTC）',
        width: 180,
        sortable: true,
      },
      {
        field: 'status',
        title: '结果',
        width: 95,
        sortable: true,
        slots: { default: 'status' },
      },
      {
        field: 'attemptCount',
        title: '尝试',
        width: 70,
        sortable: true,
      },
      {
        field: 'completedAt',
        title: '完成时间（UTC）',
        width: 180,
        sortable: true,
      },
      {
        field: 'resultSummary',
        title: '说明',
        minWidth: 160,
        slots: { default: 'summary' },
      },
      { title: '操作', width: 80, fixed: 'right', slots: { default: 'actions' } },
    ],
    pagerConfig: { pageSize: 10, pageSizes: [10, 20, 50, 100] },
    sortConfig: {
      remote: true,
      multiple: false,
      defaultSort: { field: 'fireId', order: 'desc' },
    },
    toolbarConfig: {
      custom: true,
      refresh: true,
      refreshOptions: { code: 'query' },
      zoom: true,
      search: true,
    },
    proxyConfig: {
      sort: true,
      ajax: {
        query: queryLogs,
        querySuccess: () => {
          error.value = '';
        },
        queryError: () => {
          error.value = '执行记录加载失败，请重试';
        },
      },
    },
  },
});

const detail = ref<JobFireLog>();
const [DetailModal, detailModalApi] = useVbenModal({
  footer: false,
});

async function load() {
  queryRevision += 1;
  await gridApi.query();
}

async function showDetail(row: JobFireLog) {
  if (!can('monitor:jobLog:query')) return;
  detail.value = undefined;
  detailModalApi.setState({ loading: true, title: '执行详情' });
  detailModalApi.open();
  try {
    detail.value = await getJobLog(row.fireId);
  } catch {
    ElMessage.error('获取执行详情失败');
    await detailModalApi.close();
    return;
  } finally {
    detailModalApi.setState({ loading: false });
  }
}

async function removeSelected() {
  const selected = gridApi.grid.getCheckboxRecords();
  if (selected.length === 0) return;
  try {
    await ElMessageBox.confirm(
      `仅能删除完成超过 30 天的记录。确认删除选中的 ${selected.length} 条吗？`,
      '删除执行记录',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    const removed = await removeJobLog(
      selected.map((row) => row.fireId).join(','),
    );
    ElMessage.success(`已删除 ${removed} 条`);
    await gridApi.grid.clearCheckboxRow();
    await load();
  } catch {
    /* 请求层显示错误 */
  }
}

async function cleanExpired() {
  try {
    await ElMessageBox.confirm(
      '每次最多清理 500 条完成超过 90 天的记录；运行中及近期记录保留。确认继续？',
      '清理到期记录',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    const removed = await cleanJobLog();
    ElMessage.success(`已清理 ${removed} 条到期记录`);
    await gridApi.grid.setCurrentPage(1);
    await load();
  } catch {
    /* 请求层显示错误 */
  }
}

watch([() => accessStore.accessToken, canQuery], async () => {
  if (gridApi.grid.loadData) await gridApi.grid.loadData([]);
  if (canQuery.value) await load();
});
</script>

<template>
  <Page
    title="调度日志"
    description="受控任务的执行台账；仅保留有限期的诊断记录"
    auto-content-height
    content-class="flex min-h-0 flex-col"
  >
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      class="mb-4"
    >
      <el-button link @click="load">重试</el-button>
    </el-alert>
    <Grid class="min-h-0 flex-1">
      <template #toolbar-actions>
        <el-button
          v-if="can('monitor:jobLog:remove')"
          type="danger"
          @click="removeSelected"
        >
          删除选中
        </el-button>
        <el-button
          v-if="can('monitor:jobLog:clean')"
          type="danger"
          plain
          @click="cleanExpired"
        >
          清理到期记录
        </el-button>
      </template>
      <template #status="{ row }">
        <el-tag :type="statusTag(row.status)">{{ statusLabel(row.status) }}</el-tag>
      </template>
      <template #summary="{ row }">
        <span class="break-all">{{ row.resultSummary || '—' }}</span>
      </template>
      <template #actions="{ row }">
        <el-button
          v-if="can('monitor:jobLog:query')"
          link
          type="primary"
          @click="showDetail(row)"
        >
          详情
        </el-button>
      </template>
      <template #empty>
        <el-empty
          :description="canQuery ? '暂无执行记录' : '无执行记录查看权限'"
        />
      </template>
    </Grid>
    <DetailModal class="w-full max-w-[640px]">
      <el-descriptions v-if="detail" :column="2" border>
        <el-descriptions-item label="记录 ID">
          {{ detail.fireId }}
        </el-descriptions-item>
        <el-descriptions-item label="任务 ID">
          {{ detail.jobId }}
        </el-descriptions-item>
        <el-descriptions-item label="任务名称" :span="2">
          {{ detail.jobName || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="触发">
          {{ detail.triggerType === 'MANUAL' ? '手动' : '调度' }}
        </el-descriptions-item>
        <el-descriptions-item label="结果">
          <el-tag :type="statusTag(detail.status)">
            {{ statusLabel(detail.status) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="计划时间（UTC）">
          {{ detail.scheduledFireTime || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="尝试次数">
          {{ detail.attemptCount }}
        </el-descriptions-item>
        <el-descriptions-item label="开始时间（UTC）">
          {{ detail.startedAt || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="完成时间（UTC）">
          {{ detail.completedAt || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="跟踪 ID" :span="2">
          {{ detail.traceId || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="说明" :span="2">
          <div class="max-h-40 overflow-auto break-all">
            {{ detail.resultSummary || '—' }}
          </div>
        </el-descriptions-item>
      </el-descriptions>
    </DetailModal>
  </Page>
</template>
