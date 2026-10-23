<script setup lang="ts">
import type {
  CallLogFilters,
  CallLogRow,
  CallLogStatistics,
  CallLogDetail as Detail,
} from '#/api/system/ai-call-log';

import {
  computed,
  nextTick,
  onActivated,
  onBeforeUnmount,
  onDeactivated,
  ref,
  watch,
} from 'vue';

import { useAccessStore } from '@vben/stores';

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
const detail = ref<Detail>();
const detailOpen = ref(false);
const drawer = ref<HTMLElement>();
const closeButton = ref<HTMLButtonElement>();
let returnFocus: HTMLElement | null = null;
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
      listCallLogs({ ...params, pageNum: page.value, pageSize: 20 }),
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
function search() {
  page.value = 1;
  void load();
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
function drawerKeys(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeDetail();
    return;
  }
  if (event.key !== 'Tab') return;
  const controls = [
    ...(drawer.value?.querySelectorAll<HTMLElement>(
      'button, summary, [tabindex="0"]',
    ) ?? []),
  ];
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
watch(detailOpen, async (opened) => {
  if (opened) {
    returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    await nextTick();
    if (detailOpen.value) closeButton.value?.focus();
  } else {
    returnFocus?.focus();
    returnFocus = null;
  }
});
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
watch(
  [filters, from, to],
  () => {
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
    if (enabled.value) void load();
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
  <section class="call-log" aria-label="请求日志">
    <p v-if="!can('list')">没有请求日志查看权限。</p>
    <template v-else>
      <header>
        <div>
          <h2>请求日志</h2>
          <p>每行代表一次上游交互，包含连接测试与目录扫描。默认最近7日。</p>
        </div>
        <button
          v-if="can('export')"
          :disabled="exporting || !enabled"
          @click="download"
        >
          {{ exporting ? '导出中…' : '导出结构化日志' }}
        </button>
      </header>
      <div v-if="error" role="alert" class="call-error">
        {{ error }}
        <button aria-label="关闭提示" @click="error = ''">关闭</button>
      </div>
      <form class="call-filters" @submit.prevent="search">
        <label>
          范围
          <select v-model="filters.scope" aria-label="日志范围">
            <option value="OWN">我的交互</option>
            <option v-if="can('audit')" value="AUDIT">平台审计</option>
          </select>
        </label>
        <label>
          开始
          <input
            v-model="from"
            aria-label="日志开始时间"
            type="datetime-local"
          />
        </label>
        <label>
          结束
          <input v-model="to" aria-label="日志结束时间" type="datetime-local" />
        </label>
        <label>
          类型
          <select v-model="filters.entryType" aria-label="交互类型">
            <option :value="undefined">全部</option>
            <option
              v-for="(label, value) in entryLabels"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select>
        </label>
        <label>
          状态
          <select v-model="filters.status" aria-label="日志状态">
            <option :value="undefined">全部</option>
            <option
              v-for="(label, value) in statusLabels"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select>
        </label>
        <button type="submit" :disabled="loading || !enabled">
          {{ loading ? '读取中…' : '查询' }}
        </button>
        <details class="call-advanced">
          <summary>
            高级筛选
            <span v-if="filters.requestId">· 已按请求筛选</span>
          </summary>
          <div class="call-advanced-fields">
            <label
              v-for="[field, label] in [
                ['requestId', '请求 ID'],
                ['modelRef', '模型 ID'],
                ['providerCode', '供应商'],
                ['appId', '应用 ID'],
                ['sceneKey', '场景'],
              ] as const"
              :key="field"
            >
              {{ label }}
              <input v-model="filters[field]" :aria-label="label" />
            </label>
            <template v-if="filters.scope === 'AUDIT'">
              <label>
                租户
                <input v-model="filters.tenantRef" aria-label="租户" />
              </label>
              <label>
                发起人
                <input v-model="filters.subjectRef" aria-label="发起人" />
              </label>
            </template>
          </div>
        </details>
      </form>
      <p v-if="filters.scope === 'AUDIT'">
        平台审计范围由服务端核验；私有正文仍按原访问权限保护。
      </p>
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
      <div class="call-table" tabindex="0" aria-label="上游交互列表">
        <table>
          <thead>
            <tr>
              <th>时间（本地） / 类型</th>
              <th>模型 / 渠道</th>
              <th>状态</th>
              <th>Token 输入 / 输出</th>
              <th>总耗时 / 首输出</th>
              <th>实报费用</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.callId">
              <td>
                {{ localDateTime(row.startedAt) }}
                <small>{{ entryLabels[row.entryType] }}</small>
              </td>
              <td>
                {{
                  row.modelCode ?? row.returnedModel ?? row.modelRef ?? '未提供'
                }}
                <small>
                  {{ row.configName ?? row.providerCode ?? '未提供' }}
                </small>
              </td>
              <td>
                {{ statusLabels[row.status] ?? row.status }}
                <small v-if="row.errorCode">{{ row.errorCode }}</small>
              </td>
              <td>
                {{ tokenValue(row, row.inputTokens) }} /
                {{ tokenValue(row, row.outputTokens) }}
              </td>
              <td>
                {{ exact(row.elapsedMs)
                }}{{ row.elapsedMs === null ? '' : ' ms' }}
                <small>{{ outputTime(row) }}</small>
              </td>
              <td>{{ costValue(row) }}</td>
              <td>
                <button v-if="can('query')" @click="open(row)">详情</button>
                <button
                  v-if="row.requestId"
                  @click="
                    filters.requestId = row.requestId;
                    search();
                  "
                >
                  同一请求
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="queried && !loading && rows.length === 0 && !error">
        当前范围没有上游交互记录。
      </p>
      <p v-else-if="!queried && !loading && !error">设置范围后点击查询。</p>
      <footer>
        <span v-if="queried">共 {{ total }} 次交互 · 第 {{ page }} 页</span>
        <span v-else>尚未查询</span>
        <button
          :disabled="page <= 1 || loading"
          @click="
            page--;
            load();
          "
        >
          上一页
        </button>
        <button
          :disabled="rows.length < 20 || loading"
          @click="
            page++;
            load();
          "
        >
          下一页
        </button>
      </footer>
      <div v-if="detailOpen" class="call-overlay" @click.self="closeDetail">
        <section
          ref="drawer"
          class="call-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="交互详情"
          @keydown="drawerKeys"
        >
          <header>
            <h2>交互详情</h2>
            <button ref="closeButton" @click="closeDetail">关闭详情</button>
          </header>
          <div class="call-drawer-content">
            <p v-if="detailError" role="alert">
              {{ detailError }}
              <button aria-label="关闭详情提示" @click="detailError = ''">
                关闭
              </button>
            </p>
            <p v-if="detailLoading">读取中…</p>
            <CallLogDetail v-if="detail" :detail="detail" />
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.call-log {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 100%;
  height: 100%;
  min-height: 0;
  padding: 16px 20px;
  overflow: auto;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
}

header,
footer {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

h2 {
  font-size: 18px;
  font-weight: 600;
}

p,
small {
  color: hsl(var(--muted-foreground));
}

small {
  display: block;
  margin-top: 5px;
}

.call-filters {
  display: grid;
  flex: none;
  grid-template-columns:
    minmax(100px, 0.7fr) repeat(2, minmax(165px, 1.3fr))
    repeat(2, minmax(100px, 0.7fr)) auto;
  gap: 12px;
  align-items: end;
  margin: 12px 0;
}

label {
  display: grid;
  gap: 6px;
  min-width: 0;
  font-size: 12px;
}

input,
select,
button {
  min-width: 0;
  padding: 7px 10px;
  color: inherit;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: default;
  opacity: 0.5;
}

.call-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
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

.call-table {
  flex: 1;
  max-width: 100%;
  min-height: 0;
  overflow: auto;
}

table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}

th,
td {
  min-width: 100px;
  max-width: 240px;
  padding: 12px 8px;
  text-align: left;
  overflow-wrap: anywhere;
  border-bottom: 1px solid hsl(var(--border));
}

td button {
  margin: 3px;
}

footer {
  margin-top: 12px;
}

.call-advanced {
  grid-column: 1 / -1;
  min-width: 0;
}

summary {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
}

.call-advanced-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  max-height: 130px;
  padding: 12px 0;
  overflow: auto;
}

.call-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
  background: rgb(0 0 0 / 25%);
}

.call-drawer {
  display: flex;
  flex-direction: column;
  width: min(680px, 94vw);
  min-width: 0;
  height: 100%;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
  box-shadow: -6px 0 24px rgb(0 0 0 / 12%);
}

.call-drawer > header {
  padding: 16px 20px;
  border-bottom: 1px solid hsl(var(--border));
}

.call-drawer-content {
  flex: 1;
  min-height: 0;
  padding: 0 20px 20px;
  overflow: auto;
}

@media (max-width: 1000px) {
  .call-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .call-log {
    overflow: auto;
  }

  .call-table {
    flex: none;
    max-height: 45vh;
  }
}

.call-error {
  padding: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}
</style>
