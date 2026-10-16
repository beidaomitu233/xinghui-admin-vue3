<script lang="ts" setup>
import type { JobFireLog } from '#/api/monitor/jobLog';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  cleanJobLog,
  getJobLog,
  getJobLogList,
  removeJobLog,
} from '#/api/monitor/jobLog';

const accessStore = useAccessStore();
const can = (code: string) => accessStore.accessCodes.includes(code);
const filters = reactive({
  jobId: '',
  jobName: '',
  status: '',
  triggerType: '',
});
const paging = reactive({ pageNum: 1, pageSize: 10 });
const rows = ref<JobFireLog[]>([]);
const selectedIds = ref<string[]>([]);
const total = ref(0);
const loading = ref(false);
const loadError = ref(false);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<JobFireLog>();

const statuses = [
  { value: 'CLAIMED', label: '执行中' },
  { value: 'SUCCEEDED', label: '成功' },
  { value: 'FAILED', label: '失败' },
  { value: 'SKIPPED', label: '已跳过' },
  { value: 'CANCELLED', label: '已取消' },
];

function statusLabel(value: string) {
  return statuses.find((item) => item.value === value)?.label || value;
}

async function load() {
  loading.value = true;
  loadError.value = false;
  try {
    const result = await getJobLogList({ ...paging, ...filters });
    rows.value = result.records;
    total.value = Number(result.total) || 0;
  } catch {
    rows.value = [];
    loadError.value = true;
    ElMessage.error('获取执行记录失败');
  } finally {
    loading.value = false;
  }
}

function search() {
  paging.pageNum = 1;
  void load();
}

function reset() {
  Object.assign(filters, {
    jobId: '',
    jobName: '',
    status: '',
    triggerType: '',
  });
  search();
}

async function showDetail(row: JobFireLog) {
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = undefined;
  try {
    detail.value = await getJobLog(row.fireId);
  } catch {
    ElMessage.error('获取执行详情失败');
  } finally {
    detailLoading.value = false;
  }
}

async function removeSelected() {
  if (selectedIds.value.length === 0) return;
  try {
    await ElMessageBox.confirm(
      `仅能删除完成超过 30 天的记录。确认删除选中的 ${selectedIds.value.length} 条吗？`,
      '删除执行记录',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    const removed = await removeJobLog(selectedIds.value.join(','));
    ElMessage.success(`已删除 ${removed} 条`);
    selectedIds.value = [];
    await load();
  } catch {
    ElMessage.error('删除失败：记录可能仍在执行或未满 30 天');
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
    await load();
  } catch {
    ElMessage.error('清理失败');
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <Page
    title="调度执行记录"
    description="仅展示新调度的执行记录；历史记录请单独核查"
  >
    <el-alert
      v-if="loadError"
      class="mb-4"
      type="error"
      title="执行记录加载失败"
      closable
      show-icon
    >
      <template #default>
        <el-button link type="primary" @click="load">重试</el-button>
      </template>
    </el-alert>
    <el-card class="mb-4" shadow="never">
      <el-form :inline="true" :model="filters">
        <el-form-item label="任务 ID">
          <el-input
            v-model="filters.jobId"
            clearable
            placeholder="精确 ID"
            @keyup.enter="search"
          />
        </el-form-item>
        <el-form-item label="任务名称">
          <el-input
            v-model="filters.jobName"
            clearable
            placeholder="精确名称"
            @keyup.enter="search"
          />
        </el-form-item>
        <el-form-item label="触发方式">
          <el-select
            v-model="filters.triggerType"
            clearable
            style="width: 120px"
          >
            <el-option label="计划" value="SCHEDULED" />
            <el-option label="手动" value="MANUAL" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable style="width: 120px">
            <el-option
              v-for="item in statuses"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">搜索</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span>执行记录</span>
          <div>
            <el-button
              v-if="can('monitor:jobLog:remove')"
              type="danger"
              :disabled="selectedIds.length === 0"
              @click="removeSelected"
            >
              删除选中
            </el-button>
            <el-button
              v-if="can('monitor:jobLog:clean')"
              type="warning"
              @click="cleanExpired"
            >
              清理到期记录
            </el-button>
          </div>
        </div>
      </template>
      <el-table
        v-loading="loading"
        :data="rows"
        empty-text="暂无调度执行记录"
        stripe
        @selection-change="
          (selection: JobFireLog[]) =>
            (selectedIds = selection.map((item) => item.fireId))
        "
      >
        <el-table-column
          v-if="can('monitor:jobLog:remove')"
          type="selection"
          width="50"
        />
        <el-table-column prop="fireId" label="记录 ID" width="115" />
        <el-table-column prop="jobId" label="任务 ID" width="115" />
        <el-table-column label="任务名称" min-width="150">
          <template #default="{ row }">
            {{ row.jobName || `已删除任务 ${row.jobId}` }}
          </template>
        </el-table-column>
        <el-table-column prop="triggerType" label="触发" width="110" />
        <el-table-column
          prop="scheduledFireTime"
          label="计划时间（UTC）"
          width="185"
        />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag
              :type="
                row.status === 'SUCCEEDED'
                  ? 'success'
                  : row.status === 'FAILED'
                    ? 'danger'
                    : 'info'
              "
            >
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="attemptCount" label="尝试" width="70" />
        <el-table-column
          prop="completedAt"
          label="完成时间（UTC）"
          width="185"
        />
        <el-table-column label="操作" width="75" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="can('monitor:jobLog:query')"
              link
              type="primary"
              @click="showDetail(row)"
            >
              详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="paging.pageNum"
          v-model:page-size="paging.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          background
          layout="total, sizes, prev, pager, next, jumper"
          @change="load"
        />
      </div>
    </el-card>

    <el-dialog v-model="detailOpen" title="执行详情" width="700px">
      <div v-loading="detailLoading">
        <el-descriptions v-if="detail" :column="2" border>
          <el-descriptions-item label="记录 ID">
            {{ detail.fireId }}
          </el-descriptions-item>
          <el-descriptions-item label="追踪 ID">
            {{ detail.traceId || '历史记录暂无' }}
          </el-descriptions-item>
          <el-descriptions-item label="任务 ID">
            {{ detail.jobId }}
          </el-descriptions-item>
          <el-descriptions-item label="任务名称">
            {{ detail.jobName || `已删除任务 ${detail.jobId}` }}
          </el-descriptions-item>
          <el-descriptions-item label="任务组">
            {{ detail.jobGroup || '未知' }}
          </el-descriptions-item>
          <el-descriptions-item label="触发方式">
            {{ detail.triggerType }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            {{ statusLabel(detail.status) }}
          </el-descriptions-item>
          <el-descriptions-item label="尝试次数">
            {{ detail.attemptCount }}
          </el-descriptions-item>
          <el-descriptions-item label="计划时间（UTC）">
            {{ detail.scheduledFireTime || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="开始时间（UTC）">
            {{ detail.startedAt || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="完成时间（UTC）">
            {{ detail.completedAt || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="结果摘要">
            {{ detail.resultSummary || '—' }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-dialog>
  </Page>
</template>
