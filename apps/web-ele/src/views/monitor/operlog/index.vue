<script lang="ts" setup>
import type { OperLogInfo, OperLogListParams } from '#/api/monitor/operlog';

import { computed, ref, watch } from 'vue';

import { Page, useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { createVbenGridQuery, useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  cleanOperLog,
  getOperLogList,
  removeOperLog,
} from '#/api/monitor/operlog';

const accessStore = useAccessStore();
const can = (code: string) => accessStore.accessCodes.includes(code);
const canQuery = computed(() => can('monitor:operlog:list'));
const error = ref('');
let queryRevision = 0;

const businessTypeMap: Record<number, string> = {
  0: '其它',
  1: '新增',
  2: '修改',
  3: '删除',
  4: '授权',
  5: '导出',
  6: '导入',
  7: '强退',
  8: '生成代码',
  9: '清空数据',
};
const businessTypeOptions = Object.entries(businessTypeMap).map(
  ([value, label]) => ({ label, value: Number(value) }),
);
type TagType = 'danger' | 'info' | 'primary' | 'success' | 'warning';
function businessTypeName(type: number) {
  return businessTypeMap[type] || '未知';
}
function businessTypeColor(type: number): TagType {
  const colors: Record<number, TagType> = {
    1: 'success',
    2: 'warning',
    3: 'danger',
    4: 'primary',
  };
  return colors[type] ?? 'info';
}

const sortableFields = new Set([
  'businessType',
  'costTime',
  'operName',
  'operTime',
  'status',
  'title',
]);
function logOrdering(sort: {
  field?: unknown;
  order?: unknown;
}): Pick<OperLogListParams, 'order' | 'orderBy'> {
  if (
    typeof sort.field === 'string' &&
    sortableFields.has(sort.field) &&
    (sort.order === 'asc' || sort.order === 'desc')
  ) {
    return {
      orderBy: sort.field as OperLogListParams['orderBy'],
      order: sort.order,
    };
  }
  return { orderBy: 'operTime', order: 'desc' };
}

const queryLogs: () => Promise<{
  items: OperLogInfo[];
  total: number;
}> = createVbenGridQuery(
  () => gridApi,
  async ({ page, sort, form }) => {
    if (!canQuery.value) return { items: [], total: 0 };
    const title = String(form.title ?? '').trim();
    const operName = String(form.operName ?? '').trim();
    const businessType = form.businessType;
    const status = form.status;
    const result = await getOperLogList({
      pageNum: page.currentPage,
      pageSize: page.pageSize,
      ...(title && { title }),
      ...(operName && { operName }),
      ...(businessType !== '' &&
        businessType !== undefined &&
        businessType !== null && { businessType: Number(businessType) }),
      ...(status !== '' &&
        status !== undefined &&
        status !== null && { status: Number(status) }),
      ...logOrdering(sort),
    });
    return {
      items: result.records ?? [],
      total: Number(result.total) || 0,
    };
  },
  () =>
    JSON.stringify([accessStore.accessToken, canQuery.value, queryRevision]),
);

const [Grid, gridApi] = useVbenVxeGrid<OperLogInfo>({
  tableTitle: '操作日志',
  formOptions: {
    collapsed: true,
    submitOnEnter: true,
    schema: [
      {
        fieldName: 'title',
        label: '系统模块',
        component: 'Input',
        defaultValue: '',
      },
      {
        fieldName: 'operName',
        label: '操作人员',
        component: 'Input',
        defaultValue: '',
      },
      {
        fieldName: 'businessType',
        label: '操作类型',
        component: 'Select',
        componentProps: { clearable: true, options: businessTypeOptions },
      },
      {
        fieldName: 'status',
        label: '状态',
        component: 'Select',
        componentProps: {
          clearable: true,
          options: [
            { label: '成功', value: 0 },
            { label: '失败', value: 1 },
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
      await gridApi.grid.sort({ field: 'operTime', order: 'desc' });
      await gridApi.grid.setCurrentPage(1);
      await gridApi.query(values);
    },
  },
  gridOptions: {
    height: 'auto',
    rowConfig: { keyField: 'operId' },
    checkboxConfig: { reserve: true, highlight: true },
    columns: [
      { type: 'checkbox', width: 50 },
      { field: 'operId', title: '日志 ID', width: 90 },
      { field: 'title', title: '系统模块', minWidth: 120, sortable: true },
      {
        field: 'businessType',
        title: '操作类型',
        width: 100,
        sortable: true,
        slots: { default: 'businessType' },
      },
      { field: 'operName', title: '操作人员', width: 120, sortable: true },
      { field: 'operIp', title: '操作 IP', width: 140 },
      {
        field: 'status',
        title: '状态',
        width: 85,
        sortable: true,
        slots: { default: 'status' },
      },
      { field: 'costTime', title: '耗时(ms)', width: 100, sortable: true },
      { field: 'operTime', title: '操作时间', width: 180, sortable: true },
      {
        title: '操作',
        width: 80,
        fixed: 'right',
        slots: { default: 'actions' },
      },
    ],
    pagerConfig: { pageSize: 10, pageSizes: [10, 20, 50, 100] },
    sortConfig: {
      remote: true,
      multiple: false,
      defaultSort: { field: 'operTime', order: 'desc' },
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
          error.value = '操作日志加载失败，请重试';
        },
      },
    },
  },
});

const detail = ref<OperLogInfo>();
const [DetailModal, detailModalApi] = useVbenModal({
  cancelText: '关闭',
  footer: false,
});

async function load() {
  queryRevision += 1;
  await gridApi.query();
}

function showDetail(row: OperLogInfo) {
  detail.value = row;
  detailModalApi.setState({ title: '操作日志详情' });
  detailModalApi.open();
}

async function deleteSelected() {
  const selected = gridApi.grid.getCheckboxRecords();
  if (selected.length === 0) {
    ElMessage.warning('请选择要删除的日志');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selected.length} 条日志吗？`,
      '删除确认',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await removeOperLog(selected.map((row) => row.operId));
    ElMessage.success('删除成功');
    await gridApi.grid.clearCheckboxRow();
    await gridApi.grid.setCurrentPage(1);
    await load();
  } catch {
    /* 请求层显示错误 */
  }
}

async function cleanAll() {
  try {
    await ElMessageBox.confirm(
      '确定要清空所有操作日志吗？此操作不可恢复！',
      '清空确认',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await cleanOperLog();
    ElMessage.success('清空成功');
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
    title="操作日志"
    description="查看系统操作日志记录"
    auto-content-height
    content-class="flex min-h-0 flex-col"
  >
    <el-alert v-if="error" :title="error" type="error" show-icon class="mb-4">
      <el-button link @click="load">重试</el-button>
    </el-alert>
    <Grid class="min-h-0 flex-1">
      <template #toolbar-actions>
        <el-button
          v-if="can('monitor:operlog:remove')"
          type="danger"
          @click="deleteSelected"
        >
          删除
        </el-button>
        <el-button
          v-if="can('monitor:operlog:clean')"
          type="danger"
          plain
          @click="cleanAll"
        >
          清空
        </el-button>
      </template>
      <template #businessType="{ row }">
        <el-tag :type="businessTypeColor(row.businessType)">
          {{ businessTypeName(row.businessType) }}
        </el-tag>
      </template>
      <template #status="{ row }">
        <el-tag :type="row.status === 0 ? 'success' : 'danger'">
          {{ row.status === 0 ? '成功' : '失败' }}
        </el-tag>
      </template>
      <template #actions="{ row }">
        <el-button link type="primary" @click="showDetail(row)">详情</el-button>
      </template>
      <template #empty>
        <el-empty
          :description="canQuery ? '暂无操作日志' : '无操作日志查看权限'"
        />
      </template>
    </Grid>
    <DetailModal class="w-full max-w-[720px]">
      <el-descriptions v-if="detail" :column="2" border>
        <el-descriptions-item label="操作模块">
          {{ detail.title }}
        </el-descriptions-item>
        <el-descriptions-item label="操作类型">
          <el-tag :type="businessTypeColor(detail.businessType)">
            {{ businessTypeName(detail.businessType) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="请求方式">
          {{ detail.requestMethod }}
        </el-descriptions-item>
        <el-descriptions-item label="操作人员">
          {{ detail.operName }}
        </el-descriptions-item>
        <el-descriptions-item label="部门名称">
          {{ detail.deptName }}
        </el-descriptions-item>
        <el-descriptions-item label="操作 IP">
          {{ detail.operIp }}
        </el-descriptions-item>
        <el-descriptions-item label="操作地点">
          {{ detail.operLocation }}
        </el-descriptions-item>
        <el-descriptions-item label="操作状态">
          <el-tag :type="detail.status === 0 ? 'success' : 'danger'">
            {{ detail.status === 0 ? '成功' : '失败' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="耗时">
          {{ detail.costTime }} ms
        </el-descriptions-item>
        <el-descriptions-item label="操作时间">
          {{ detail.operTime }}
        </el-descriptions-item>
        <el-descriptions-item label="操作方法" :span="2">
          <div class="break-all">{{ detail.method }}</div>
        </el-descriptions-item>
        <el-descriptions-item label="请求 URL" :span="2">
          <div class="break-all">{{ detail.operUrl }}</div>
        </el-descriptions-item>
        <el-descriptions-item label="请求参数" :span="2">
          <div class="max-h-32 overflow-auto break-all">
            {{ detail.operParam }}
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="返回参数" :span="2">
          <div class="max-h-32 overflow-auto break-all">
            {{ detail.jsonResult }}
          </div>
        </el-descriptions-item>
        <el-descriptions-item
          v-if="detail.status === 1"
          label="错误消息"
          :span="2"
        >
          <span class="text-red-500">{{ detail.errorMsg }}</span>
        </el-descriptions-item>
      </el-descriptions>
    </DetailModal>
  </Page>
</template>
