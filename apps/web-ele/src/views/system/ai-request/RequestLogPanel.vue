<script setup lang="ts">
import type { RequestStatus } from '#/api/system/ai-application';
import type {
  RequestLogDetail,
  RequestLogFilters,
  RequestLogRow,
  RequestLogStatistics,
} from '#/api/system/ai-request-log';

import {
  computed,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  ref,
  watch,
} from 'vue';

import { useAccessStore } from '@vben/stores';

import { ElMessage } from 'element-plus';

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
        pageNum: pageNum.value,
        pageSize: pageSize.value,
      }),
      props.controlledFilters
        ? Promise.resolve(undefined)
        : requestLogStatistics(query),
    ]);
    if (run !== serial) return;
    rows.value = page.records;
    total.value = Number(page.total);
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
function search() {
  pageNum.value = 1;
  void load();
}
function changeScope() {
  filters.value.tenantRef = undefined;
  filters.value.subjectRef = undefined;
  rows.value = [];
  stats.value = undefined;
  detailOpen.value = false;
  detail.value = undefined;
  detailSerial++;
  search();
}
async function open(row: RequestLogRow) {
  if (!can('query')) return;
  const run = ++detailSerial;
  detail.value = undefined;
  detailOpen.value = true;
  try {
    const result = await getRequestLog(row.request.requestId, snapshot());
    if (run === detailSerial) detail.value = result;
  } catch {
    if (run === detailSerial) {
      detailOpen.value = false;
      error.value = '详情读取失败。';
    }
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
watch(
  () => props.appId,
  (appId) => {
    filters.value.appId = appId;
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
    <el-form v-if="!controlledFilters" inline @submit.prevent="search">
      <el-form-item label="范围">
        <el-select
          v-model="filters.scope"
          placeholder="请选择范围"
          style="width: 160px; min-width: 160px"
          @change="changeScope"
        >
          <el-option label="本人" value="OWN" />
          <el-option v-if="canAudit" label="平台审计" value="AUDIT" />
        </el-select>
      </el-form-item>
      <el-form-item label="应用 ID">
        <el-input
          v-model="filters.appId"
          :disabled="!!props.appId"
          maxlength="19"
          clearable
        />
      </el-form-item>
      <el-form-item label="请求 ID">
        <el-input v-model="filters.requestId" maxlength="19" clearable />
      </el-form-item>
      <el-form-item label="业务记录">
        <el-input v-model="filters.businessId" maxlength="128" clearable />
      </el-form-item>
      <el-form-item label="模型引用">
        <el-input v-model="filters.modelRef" maxlength="128" clearable />
      </el-form-item>
      <el-form-item label="状态">
        <el-select
          v-model="filters.status"
          clearable
          placeholder="全部状态"
          style="width: 160px; min-width: 160px"
        >
          <el-option
            v-for="status in statuses"
            :key="status"
            :label="labels[status]"
            :value="status"
          />
        </el-select>
      </el-form-item>
      <el-form-item v-if="filters.scope === 'AUDIT'" label="租户">
        <el-input v-model="filters.tenantRef" maxlength="64" clearable />
      </el-form-item>
      <el-form-item v-if="filters.scope === 'AUDIT'" label="主体">
        <el-input v-model="filters.subjectRef" maxlength="128" clearable />
      </el-form-item>
      <el-form-item label="时间">
        <el-date-picker
          v-model="dates"
          type="datetimerange"
          start-placeholder="开始"
          end-placeholder="结束"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="loading" @click="search">
          查询
        </el-button>
        <el-button v-if="can('export')" :loading="exporting" @click="download">
          导出 JSON
        </el-button>
      </el-form-item>
    </el-form>
    <div v-else class="mb-3 flex justify-end gap-2">
      <el-button :loading="loading" @click="search">刷新日志</el-button>
      <el-button v-if="can('export')" :loading="exporting" @click="download">
        导出 JSON
      </el-button>
    </div>
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
    <el-table
      v-loading="loading"
      :data="rows"
      row-key="request.requestId"
      border
      empty-text="暂无授权范围内的请求"
    >
      <el-table-column
        prop="request.requestId"
        label="请求 ID"
        min-width="120"
      />
      <el-table-column prop="appName" label="场景 / 历史应用" min-width="140" />
      <el-table-column label="版本" width="100">
        <template #default="{ row }">
          {{
            row.request.sceneVersionId ??
            row.request.appVersionId ??
            `草稿 ${row.request.draftRevision}`
          }}
        </template>
      </el-table-column>
      <el-table-column
        prop="request.businessId"
        label="业务记录"
        min-width="140"
      />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          {{ labels[row.request.status as RequestStatus] }}
        </template>
      </el-table-column>
      <el-table-column prop="request.stage" label="阶段" width="110" />
      <el-table-column label="耗时" width="100">
        <template #default="{ row }">{{ row.elapsedMs }} ms</template>
      </el-table-column>
      <el-table-column prop="request.attemptCount" label="尝试" width="80" />
      <el-table-column label="输入 / 输出 Token" min-width="150">
        <template #default="{ row }">
          {{ row.request.inputTokens ?? '未知' }} /
          {{ row.request.outputTokens ?? '未知' }}
        </template>
      </el-table-column>
      <el-table-column
        v-if="effectiveScope === 'AUDIT'"
        prop="tenantRef"
        label="租户"
        min-width="100"
      />
      <el-table-column
        v-if="effectiveScope === 'AUDIT'"
        prop="subjectRef"
        label="主体"
        min-width="100"
      />
      <el-table-column
        prop="request.errorCode"
        label="安全分类"
        min-width="150"
      />
      <el-table-column
        v-if="can('query')"
        label="操作"
        width="96"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button link @click="open(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="pageNum"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total,sizes,prev,pager,next"
      class="mt-3"
      @current-change="load"
      @size-change="search"
    />
    <el-dialog
      v-model="detailOpen"
      title="请求时间线"
      width="min(1120px,95vw)"
      @closed="detailSerial++"
    >
      <template v-if="detail">
        <p class="mb-3 break-all">
          请求 {{ detail.request.request.requestId }} ·
          {{ detail.request.appName }} ·
          {{
            detail.request.request.errorCode ??
            labels[detail.request.request.status]
          }}
        </p>
        <el-table :data="detail.stages" border class="mb-4">
          <el-table-column prop="stage" label="阶段" width="100" />
          <el-table-column prop="outcome" label="结果" width="130" />
          <el-table-column prop="referenceKind" label="引用类型" width="110" />
          <el-table-column prop="referenceId" label="引用 ID" min-width="120" />
          <el-table-column
            prop="referenceVersion"
            label="引用版本"
            min-width="120"
          />
          <el-table-column prop="errorCode" label="分类" min-width="140" />
          <el-table-column prop="createdAt" label="时间" min-width="180" />
        </el-table>
        <el-table :data="detail.attempts" border empty-text="尚未调用供应商">
          <el-table-column prop="number" label="次数" width="70" />
          <el-table-column label="实际提供商 / 模型" min-width="180">
            <template #default="{ row }">
              {{ row.providerCode ?? '未知' }} / {{ row.modelCode ?? '未知' }}
            </template>
          </el-table-column>
          <el-table-column
            prop="configVersion"
            label="配置版本"
            min-width="110"
          />
          <el-table-column
            prop="maskedKeyLabel"
            label="脱敏 Key"
            min-width="130"
          />
          <el-table-column label="Key 版本" min-width="100">
            <template #default="{ row }">
              {{ row.keyVersion ?? '未知' }}
            </template>
          </el-table-column>
          <el-table-column
            prop="switchReason"
            label="选择原因"
            min-width="130"
          />
          <el-table-column prop="status" label="终态" min-width="110" />
          <el-table-column label="输出配额" width="100">
            <template #default="{ row }">
              {{ row.outputTokenLimit ?? '未知' }}
            </template>
          </el-table-column>
          <el-table-column label="输入 / 输出" min-width="120">
            <template #default="{ row }">
              {{ row.inputTokens ?? '未知' }} / {{ row.outputTokens ?? '未知' }}
            </template>
          </el-table-column>
          <el-table-column label="上游追踪 ID" min-width="180">
            <template #default="{ row }">
              {{ row.providerRequestId ?? '未知' }}
            </template>
          </el-table-column>
          <el-table-column prop="errorCode" label="分类" min-width="130" />
        </el-table>
      </template>
      <template #footer>
        <el-button @click="detailOpen = false">关闭</el-button>
      </template>
    </el-dialog>
  </template>
</template>
