<script setup lang="ts">
import type { RequestLogFilters } from '#/api/system/ai-request-log';
import type { SceneMonitor } from '#/api/system/ai-scene';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useAccessStore } from '@vben/stores';

import { getSceneMonitor } from '#/api/system/ai-scene';

import KeySettingsPanel from '../ai-config/KeySettingsPanel.vue';
import RequestLogPanel from './RequestLogPanel.vue';

const props = defineProps<{ initialKeySettings?: boolean }>();
const access = useAccessStore();
const route = useRoute();
const canLogs = computed(() => access.accessCodes.includes('ai:request:list'));
const canKeys = computed(() =>
  access.accessCodes.some((code) =>
    /^ai:(?:config|model):(?:list|query|add|edit|test|enable)$/.test(code),
  ),
);
const canAudit = computed(() =>
  access.accessCodes.includes('ai:request:audit'),
);
const settings = ref(
  Boolean(props.initialKeySettings || route.query.settings === 'keys'),
);
const scope = ref<'AUDIT' | 'OWN'>('OWN');
const requestKind = ref<'BUSINESS' | 'TEST'>('BUSINESS');
const sceneKey = ref('');
const modelRef = ref('');
const result = ref<'' | NonNullable<RequestLogFilters['status']>>('');
const localTime = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
const to = ref(localTime(new Date()));
const from = ref(localTime(new Date(Date.now() - 24 * 60 * 60_000)));
const applied = ref<RequestLogFilters>();
const filterError = ref('');
const summary = ref<SceneMonitor>();
const loading = ref(false);
const failed = ref(false);
let generation = 0;
let disposed = false;
async function load() {
  const run = ++generation;
  summary.value = undefined;
  if (!canLogs.value) return;
  loading.value = true;
  failed.value = false;
  try {
    if (!applied.value) return;
    const result = await getSceneMonitor({
      scope: applied.value.scope,
      requestKind: applied.value.requestKind,
      sceneKey: applied.value.sceneKey,
      modelRef: applied.value.modelRef,
      result: applied.value.status,
      from: applied.value.from,
      to: applied.value.to,
    });
    if (!disposed && run === generation) summary.value = result;
  } catch {
    if (!disposed && run === generation) failed.value = true;
  } finally {
    if (!disposed && run === generation) loading.value = false;
  }
}
function applyFilters() {
  if (!canLogs.value) {
    generation++;
    summary.value = undefined;
    applied.value = undefined;
    return;
  }
  const start = new Date(from.value);
  const end = new Date(to.value);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start >= end ||
    end.getTime() - start.getTime() > 31 * 24 * 60 * 60_000
  ) {
    filterError.value = '请选择有效时间，最长 31 天。';
    return;
  }
  filterError.value = '';
  applied.value = {
    scope: scope.value,
    requestKind: requestKind.value,
    sceneKey: sceneKey.value || undefined,
    modelRef: modelRef.value || undefined,
    status: result.value || undefined,
    from: start.toISOString(),
    to: end.toISOString(),
  };
  void load();
}
watch([scope, requestKind, canLogs], applyFilters);
watch(canAudit, (value) => {
  if (!value) {
    scope.value = 'OWN';
    if (applied.value?.scope === 'AUDIT') {
      applied.value = { ...applied.value, scope: 'OWN' };
      void load();
    }
  }
});
watch(canKeys, (value) => {
  if (!value) settings.value = false;
});
watch(
  () => route.query.settings,
  (value) => {
    if (value === 'keys' && canKeys.value) settings.value = true;
  },
);
onMounted(applyFilters);
onBeforeUnmount(() => {
  disposed = true;
  generation++;
});
const count = (value: null | number | string | undefined) =>
  value === null || value === undefined ? '—' : String(value);
</script>
<template>
  <div class="monitor-workspace">
    <header>
      <div>
        <h1>调用监控</h1>
        <p>业务调用与配置测试分别查看</p>
      </div>
      <button v-if="canKeys" type="button" @click="settings = true">
        Key 设置
      </button>
    </header>
    <template v-if="canLogs">
      <div class="filters">
        <label>
          范围
          <select v-model="scope" aria-label="调用范围">
            <option value="OWN">我的调用</option>
            <option v-if="canAudit" value="AUDIT">审计范围</option>
          </select>
        </label>
        <label>
          请求类型
          <select v-model="requestKind" aria-label="请求类型">
            <option value="BUSINESS">业务调用</option>
            <option value="TEST">主动测试</option>
          </select>
        </label>
        <label>
          场景
          <input
            v-model="sceneKey"
            aria-label="筛选场景"
            placeholder="全部场景"
          />
        </label>
        <label>
          模型
          <input
            v-model="modelRef"
            aria-label="筛选模型"
            placeholder="全部模型"
          />
        </label>
        <label>
          结果
          <select v-model="result">
            <option value="">全部结果</option>
            <option
              v-for="status in [
                'QUEUED',
                'RUNNING',
                'SUCCEEDED',
                'FAILED',
                'CANCELLED',
                'INCOMPLETE',
                'TIMED_OUT',
              ] as const"
              :key="status"
              :value="status"
            >
              {{
                {
                  QUEUED: '排队中',
                  RUNNING: '生成中',
                  SUCCEEDED: '成功',
                  FAILED: '失败',
                  CANCELLED: '取消',
                  INCOMPLETE: '未完成',
                  TIMED_OUT: '超时',
                }[status]
              }}
            </option>
          </select>
        </label>
        <label>
          开始
          <input v-model="from" aria-label="开始时间" type="datetime-local" />
        </label>
        <label>
          结束
          <input v-model="to" aria-label="结束时间" type="datetime-local" />
        </label>
        <button type="button" :disabled="loading" @click="applyFilters">
          查询
        </button>
      </div>
      <p v-if="filterError" role="alert">{{ filterError }}</p>
      <p v-if="loading" role="status">正在读取统计…</p>
      <p v-else-if="failed" role="alert">统计读取失败，请重试。</p>
      <template v-if="summary">
        <p class="window">
          {{ summary.scope === 'OWN' ? '我的调用' : '审计范围' }} ·
          {{ new Date(summary.window.from).toLocaleString() }} —
          {{ new Date(summary.window.to).toLocaleString() }}
        </p>
        <section class="cards" aria-label="调用统计">
          <article>
            <span>启用 Key</span>
            <strong>{{ count(summary.keyCards.enabledKeyVersions) }}</strong>
          </article>
          <article>
            <span>近期调用异常 Key</span>
            <strong>
              {{ count(summary.keyCards.recentlyFailedKeyVersions) }}
            </strong>
          </article>
          <article>
            <span>请求数</span>
            <strong>{{ count(summary.calls?.requests) }}</strong>
          </article>
          <article>
            <span>模型尝试数</span>
            <strong>{{ count(summary.calls?.modelAttempts) }}</strong>
          </article>
        </section>
        <p v-if="summary.keyCards.unavailableReason" class="window">
          部分 Key 统计在当前权限范围内不可用
        </p>
      </template>
      <section class="logs">
        <h2>请求日志</h2>
        <RequestLogPanel v-if="applied" :controlled-filters="applied" />
      </section>
    </template>
    <p v-else class="empty">当前账号可通过 Key 设置管理配置。</p>
    <el-drawer
      v-if="canKeys"
      v-model="settings"
      title="Key 设置"
      size="min(1100px, 96vw)"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <KeySettingsPanel v-if="settings" />
    </el-drawer>
  </div>
</template>
<style scoped>
.monitor-workspace {
  padding: 24px;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 28px;
}
h1 {
  font-size: 22px;
  font-weight: 600;
}
header p,
.window,
.empty {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  margin-top: 8px;
}
button {
  color: hsl(var(--primary));
}
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 24px;
  margin-bottom: 20px;
}
label {
  display: flex;
  align-items: center;
  gap: 10px;
}
select,
input {
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  border-radius: 6px;
  padding: 6px 12px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin: 16px 0;
}
article,
.logs {
  padding: 20px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  background: hsl(var(--background));
}
article {
  display: grid;
  gap: 16px;
}
article span {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}
strong {
  font-size: 28px;
}
.logs {
  margin-top: 24px;
}
@media (max-width: 1024px) {
  .cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
