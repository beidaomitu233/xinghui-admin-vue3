<script lang="ts" setup>
import type { JobFire, JobInfo, JobListParams } from '#/api/monitor/job';

import { computed, ref, watch } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { createVbenGridQuery, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  changeJobStatus,
  getJobFires,
  getJobList,
  removeJob,
  runJob,
} from '#/api/monitor/job';
import { DICT_TYPE, useDictionary } from '#/composables/use-dictionary';

import JobModal from './job-modal.vue';

const accessStore = useAccessStore();
const can = (code: string) => accessStore.accessCodes.includes(code);
const canQuery = computed(() => can('monitor:job:list'));
const error = ref('');
const jobStatusDict = useDictionary(DICT_TYPE.JOB_STATUS);
let queryRevision = 0;

const sortableFields = new Set([
  'createTime',
  'jobGroup',
  'jobName',
  'nextFireTime',
  'status',
  'updateTime',
]);
function jobOrdering(sort: {
  field?: unknown;
  order?: unknown;
}): Pick<JobListParams, 'order' | 'orderBy'> {
  if (
    typeof sort.field === 'string' &&
    sortableFields.has(sort.field) &&
    (sort.order === 'asc' || sort.order === 'desc')
  ) {
    return {
      orderBy: sort.field as JobListParams['orderBy'],
      order: sort.order,
    };
  }
  return { orderBy: 'createTime', order: 'desc' };
}

const queryJobs: () => Promise<{
  items: JobInfo[];
  total: number;
}> = createVbenGridQuery(
  () => gridApi,
  async ({ page, sort, form }) => {
    if (!canQuery.value) return { items: [], total: 0 };
    const jobName = String(form.jobName ?? '').trim();
    const jobGroup = String(form.jobGroup ?? '').trim();
    const status = String(form.status ?? '').trim();
    const result = await getJobList({
      pageNum: page.currentPage,
      pageSize: page.pageSize,
      ...(jobName && { jobName }),
      ...(jobGroup && { jobGroup }),
      ...(status && { status }),
      ...jobOrdering(sort),
    });
    const items = result.records ?? [];
    await jobStatusDict.ensureLabels(items.map((job) => job.status));
    return { items, total: Number(result.total) || 0 };
  },
  () =>
    JSON.stringify([
      accessStore.accessToken,
      canQuery.value,
      queryRevision,
      jobStatusDict.error.value ? 'dict-error' : 'dict-ok',
    ]),
);

const [Grid, gridApi] = useVbenVxeGrid<JobInfo>({
  tableTitle: '任务列表',
  formOptions: {
    collapsed: true,
    submitOnEnter: true,
    schema: [
      {
        fieldName: 'jobName',
        label: '任务名称',
        component: 'Input',
        defaultValue: '',
      },
      {
        fieldName: 'jobGroup',
        label: '任务组',
        component: 'Select',
        componentProps: {
          clearable: true,
          options: [
            { label: '默认', value: 'DEFAULT' },
            { label: '系统', value: 'SYSTEM' },
          ],
        },
      },
      {
        fieldName: 'status',
        label: '状态',
        component: 'Select',
        componentProps: {
          clearable: true,
          options: [],
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
      await gridApi.grid.sort({ field: 'createTime', order: 'desc' });
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query(values);
    },
  },
  gridOptions: {
    height: 'auto',
    rowConfig: { keyField: 'jobId' },
    checkboxConfig: { reserve: true, highlight: true },
    columns: [
      { type: 'checkbox', width: 50 },
      { field: 'jobId', title: '任务 ID', width: 90 },
      { field: 'jobName', title: '任务名称', minWidth: 150, sortable: true },
      { field: 'jobGroup', title: '任务组', width: 110, sortable: true },
      {
        field: 'handlerKey',
        title: '受控处理器',
        minWidth: 190,
        slots: { default: 'handler' },
      },
      { field: 'cronExpression', title: 'Cron', width: 160 },
      { field: 'timeZone', title: '时区', width: 140 },
      {
        field: 'nextFireTime',
        title: '下次执行（UTC）',
        width: 185,
        sortable: true,
      },
      {
        field: 'status',
        title: '状态',
        width: 100,
        sortable: true,
        slots: { default: 'status' },
      },
      { field: 'createTime', title: '创建时间', width: 180, sortable: true },
      {
        title: '操作',
        width: 300,
        fixed: 'right',
        slots: { default: 'actions' },
      },
    ],
    pagerConfig: { pageSize: 10, pageSizes: [10, 20, 50, 100] },
    sortConfig: {
      remote: true,
      multiple: false,
      defaultSort: { field: 'createTime', order: 'desc' },
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
        query: queryJobs,
        querySuccess: () => {
          error.value = '';
        },
        queryError: () => {
          error.value = '任务列表加载失败，请重试';
        },
      },
    },
  },
});

const [EditModal, modalApi] = useVbenModal({ connectedComponent: JobModal });

const firesOpen = ref(false);
const firesLoading = ref(false);
const fires = ref<JobFire[]>([]);
const firesJobName = ref('');

async function load() {
  queryRevision += 1;
  await gridApi.query();
}

async function retryStatuses() {
  await jobStatusDict.load();
  await load();
}

async function openForm(row?: JobInfo) {
  const allowed = row
    ? can('monitor:job:edit') && can('monitor:job:query')
    : can('monitor:job:add');
  if (allowed) modalApi.setData({ row }).open();
}

async function deleteJobs(rows: JobInfo[]) {
  const label =
    rows.length === 1
      ? `任务“${rows[0]!.jobName}”`
      : `选中的 ${rows.length} 条任务`;
  try {
    await ElMessageBox.confirm(`确定要删除${label}吗？`, '删除确认', {
      type: 'warning',
    });
  } catch {
    return;
  }
  try {
    await removeJob(rows.map((row) => row.jobId).join(','));
    ElMessage.success('删除成功');
    await gridApi.grid.clearCheckboxRow();
    await load();
  } catch {
    /* 请求层显示错误 */
  }
}

function deleteSelected() {
  const selected = gridApi.grid.getCheckboxRecords();
  if (selected.length > 0) void deleteJobs(selected);
}

async function toggleStatus(row: JobInfo) {
  const next = row.status === '0' ? '1' : '0';
  try {
    await changeJobStatus(row.jobId, next);
    ElMessage.success(next === '0' ? '任务已启用' : '任务已暂停');
    await load();
  } catch {
    /* 请求层显示错误 */
  }
}

async function runNow(row: JobInfo) {
  try {
    const fireId = await runJob(row.jobId);
    ElMessage.success(`已提交执行，记录 ID：${fireId}`);
  } catch {
    /* 请求层显示错误 */
  }
}

async function openFires(row: JobInfo) {
  firesOpen.value = true;
  firesJobName.value = row.jobName;
  firesLoading.value = true;
  fires.value = [];
  try {
    fires.value = await getJobFires(row.jobId);
  } catch {
    ElMessage.error('获取执行记录失败');
  } finally {
    firesLoading.value = false;
  }
}

watch([() => accessStore.accessToken, canQuery], async () => {
  if (gridApi.grid.loadData) await gridApi.grid.loadData([]);
  if (canQuery.value) await load();
});

watch(
  () => jobStatusDict.options.value,
  (dictOptions) => {
    void gridApi.formApi.updateSchema([
      {
        fieldName: 'status',
        componentProps: {
          clearable: true,
          options: dictOptions.map((item) => ({
            label: item.label,
            value: item.value,
          })),
        },
      },
    ]);
  },
  { immediate: true },
);
void jobStatusDict.load();
</script>

<template>
  <Page
    title="定时任务"
    description="配置受控处理器并查看调度执行结果"
    auto-content-height
    content-class="flex min-h-0 flex-col"
  >
    <el-alert
      v-if="jobStatusDict.error.value"
      class="mb-4"
      title="任务状态字典加载失败，状态筛选暂不可用"
      type="error"
      show-icon
    >
      <el-button link type="primary" @click="retryStatuses">重新加载</el-button>
    </el-alert>
    <el-alert v-if="error" :title="error" type="error" show-icon class="mb-4">
      <el-button link @click="load">重试</el-button>
    </el-alert>
    <Grid class="min-h-0 flex-1">
      <template #toolbar-actions>
        <el-button
          v-if="can('monitor:job:remove')"
          type="danger"
          @click="deleteSelected"
        >
          批量删除
        </el-button>
        <el-button
          v-if="can('monitor:job:add')"
          type="primary"
          @click="openForm()"
        >
          新增任务
        </el-button>
      </template>
      <template #handler="{ row }">
        {{ row.handlerKey || '未绑定（旧任务已暂停）' }}
      </template>
      <template #status="{ row }">
        <el-tag :type="row.status === '0' ? 'success' : 'info'">
          {{ jobStatusDict.label(row.status) }}
        </el-tag>
      </template>
      <template #actions="{ row }">
        <el-button
          v-if="can('monitor:job:edit')"
          link
          type="primary"
          @click="openForm(row)"
        >
          编辑
        </el-button>
        <el-button
          v-if="can('monitor:job:changeStatus') && row.handlerKey"
          link
          type="primary"
          @click="toggleStatus(row)"
        >
          {{ row.status === '0' ? '暂停' : '启用' }}
        </el-button>
        <el-button
          v-if="can('monitor:job:run')"
          link
          type="primary"
          :disabled="row.status !== '0' || !row.handlerKey"
          @click="runNow(row)"
        >
          执行
        </el-button>
        <el-button
          v-if="can('monitor:job:query')"
          link
          type="primary"
          @click="openFires(row)"
        >
          记录
        </el-button>
        <el-button
          v-if="can('monitor:job:remove')"
          link
          type="danger"
          @click="deleteJobs([row])"
        >
          删除
        </el-button>
      </template>
      <template #empty>
        <el-empty :description="canQuery ? '暂无定时任务' : '无任务查看权限'" />
      </template>
    </Grid>
    <EditModal @saved="load" />
    <el-dialog
      v-model="firesOpen"
      :title="`${firesJobName} · 最近执行记录`"
      width="850px"
    >
      <el-table v-loading="firesLoading" :data="fires" max-height="450">
        <el-table-column prop="fireId" label="记录 ID" width="105" />
        <el-table-column prop="triggerType" label="触发" width="100" />
        <el-table-column
          prop="scheduledFireTime"
          label="计划时间（UTC）"
          width="185"
        />
        <el-table-column prop="status" label="结果" width="105" />
        <el-table-column prop="attemptCount" label="尝试" width="65" />
        <el-table-column
          prop="completedAt"
          label="完成时间（UTC）"
          width="185"
        />
        <el-table-column prop="resultSummary" label="说明" min-width="120" />
      </el-table>
    </el-dialog>
  </Page>
</template>
