<script setup lang="ts">
import type { EchartsUIType } from '@vben/plugins/echarts';

import type {
  AiAnalytics,
  MetricRow,
  MetricValue,
} from '#/api/system/ai-statistics';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElCard,
  ElDatePicker,
  ElEmpty,
  ElOption,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElStatistic,
  ElTable,
  ElTableColumn,
  ElTooltip,
} from 'element-plus';

import { getAiAnalytics } from '#/api/system/ai-statistics';

const props = defineProps<{ active: boolean }>();
const access = useAccessStore();
const canRead = computed(() => access.accessCodes.includes('ai:request:list'));
const scope = ref<'AUDIT' | 'OWN'>(
  access.accessCodes.includes('ai:request:audit') ? 'AUDIT' : 'OWN',
);
const period = ref('today');
const range = ref<[Date, Date]>();
const provider = ref('');
const model = ref('');
const data = ref<AiAnalytics>();
const catalog = ref<{ models: MetricRow[]; providers: MetricRow[] }>({
  models: [],
  providers: [],
});
const loading = ref(false);
const error = ref('');
const more = ref(false);
const metric = ref('totalTokens');
const dimension = ref<'errors' | 'models' | 'providers' | 'scenes'>('models');
const currency = ref('');
const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);
let generation = 0;
let alive = true;
const totals = computed(() => data.value?.totals ?? {});
const missing = (value: MetricValue | undefined): value is null | undefined =>
  value === null || value === undefined;
const numeric = (value: MetricValue | undefined) =>
  missing(value) ? null : Number(value);
function value(input: MetricValue | undefined, digits = 0) {
  const result = numeric(input);
  return missing(result) || !Number.isFinite(result)
    ? '—'
    : result.toLocaleString('zh-CN', { maximumFractionDigits: digits });
}
const ratio = (part: MetricValue | undefined, all: MetricValue | undefined) => {
  const p = numeric(part);
  const n = numeric(all);
  return missing(p) || !n ? '—' : `${((p * 100) / n).toFixed(1)}%`;
};
const cacheRate = computed(() =>
  ratio(totals.value.cacheReadTokens, totals.value.cacheInputTokens),
);
const currencies = computed(
  () => data.value?.costs.filter((row) => !missing(row.amount)) ?? [],
);
function currencySymbol(unit: MetricValue | undefined) {
  if (unit === 'USD') return '$';
  if (unit === 'CNY') return '¥';
  return `${unit === 'UNKNOWN' || missing(unit) ? '未注明币种' : unit} `;
}
const preciseCost = (amount: MetricValue | undefined) => {
  const n = numeric(amount);
  return n !== null && n !== 0 && Math.abs(n) < 0.000_001
    ? n.toPrecision(3)
    : value(amount, 6);
};
const modelOptions = computed(() => [
  ...new Map(catalog.value.models.map((row) => [row.modelRef, row])).values(),
]);
const sortBy = (field: string) => (a: MetricRow, b: MetricRow) => {
  const x = numeric(a[field]);
  const y = numeric(b[field]);
  if (x === null) return y === null ? 0 : -1;
  return y === null ? 1 : x - y;
};
const cost = computed(
  () =>
    currencies.value
      .map((row) => `${currencySymbol(row.currency)}${preciseCost(row.amount)}`)
      .join(' + ') || '—',
);
const comparison = computed(() => data.value?.[dimension.value] ?? []);
function comparisonCost(row: MetricRow) {
  const amounts = new Map<string, number>();
  for (const item of data.value?.modelCosts ?? []) {
    if (
      missing(item.amount) ||
      item.providerCode !== row.providerCode ||
      (dimension.value === 'models' && item.modelRef !== row.modelRef)
    )
      continue;
    const key = String(item.currency);
    amounts.set(key, (amounts.get(key) ?? 0) + Number(item.amount));
  }
  return (
    [...amounts]
      .map(
        ([unit, amount]) =>
          `${unit} ${amount !== 0 && Math.abs(amount) < 0.000_001 ? amount.toPrecision(3) : value(amount, 6)}`,
      )
      .join(' + ') || '—'
  );
}
function dates() {
  const now = new Date();
  if (period.value === 'custom' && range.value) return range.value;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period.value === 'week') start.setDate(start.getDate() - 6);
  if (period.value === 'month') start.setDate(start.getDate() - 29);
  return [start, now] as [Date, Date];
}
async function load() {
  const ticket = ++generation;
  if (!props.active || !canRead.value) return;
  const [from, to] = dates();
  if (
    to.getTime() <= from.getTime() ||
    to.getTime() - from.getTime() > 31 * 86_400_000
  ) {
    error.value = '请选择不超过31天的有效时间范围。';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const result = await getAiAnalytics({
      scope: scope.value,
      from: from.toISOString(),
      to: to.toISOString(),
      providerCode: provider.value || undefined,
      modelRef: model.value || undefined,
    });
    if (!alive || ticket !== generation) return;
    data.value = result;
    if (!provider.value && !model.value)
      catalog.value = { providers: result.providers, models: result.models };
    if (
      !currency.value ||
      !result.costs.some((row) => row.currency === currency.value)
    )
      currency.value = String(
        result.costs.find((row) => !missing(row.amount))?.currency ?? 'USD',
      );
    await nextTick();
    draw();
  } catch {
    if (alive && ticket === generation) {
      data.value = undefined;
      error.value = '统计数据读取失败，请重试。';
    }
  } finally {
    if (alive && ticket === generation) loading.value = false;
  }
}
function draw() {
  if (!data.value || !chartRef.value) return;
  const [from, to] = dates();
  const buckets = new Map<
    number,
    { amount: null | number; calls: number; totalTokens: null | number }
  >();
  for (
    let time = Math.floor(from.getTime() / 3_600_000) * 3600;
    time <= to.getTime() / 1000;
    time += 3600
  )
    buckets.set(time, { calls: 0, totalTokens: 0, amount: 0 });
  for (const row of data.value.trend) {
    const key = Number(row.bucket);
    const item = buckets.get(key) ?? { calls: 0, totalTokens: 0, amount: 0 };
    item.calls += Number(row.calls ?? 0);
    item.totalTokens =
      missing(row.totalTokens) || item.totalTokens === null
        ? null
        : item.totalTokens + Number(row.totalTokens);
    if (row.currency === 'UNKNOWN' && missing(row.amount)) item.amount = null;
    if (row.currency === currency.value)
      item.amount = missing(row.amount)
        ? null
        : (item.amount ?? 0) + Number(row.amount);
    buckets.set(key, item);
  }
  let seriesName = 'Tokens';
  if (metric.value === 'amount') seriesName = `费用 ${currency.value}`;
  else if (metric.value === 'calls') seriesName = '请求';
  renderEcharts({
    grid: { top: 20, left: 18, right: 18, bottom: 12, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: [...buckets.keys()].map((time) =>
        new Date(time * 1000).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          timeZone: 'Asia/Shanghai',
        }),
      ),
    },
    yAxis: { type: 'value', min: 0 },
    series: [
      {
        name: seriesName,
        type: 'bar',
        barMaxWidth: 32,
        data: [...buckets.values()].map(
          (row) => row[metric.value as keyof typeof row],
        ),
      },
    ],
  });
}
watch(
  () => [
    props.active,
    access.accessToken,
    ...access.accessCodes,
    scope.value,
    period.value,
    range.value,
    provider.value,
    model.value,
  ],
  load,
  { immediate: true },
);
watch([metric, currency], () => {
  void nextTick(draw);
});
onBeforeUnmount(() => {
  alive = false;
  generation++;
});
</script>

<template>
  <section class="space-y-4" aria-label="AI统计">
    <ElEmpty v-if="!canRead" description="无AI统计查看权限" />
    <template v-else>
      <div class="flex flex-wrap items-center gap-3">
        <ElSelect
          v-if="access.accessCodes.includes('ai:request:audit')"
          v-model="scope"
          class="!w-36"
          aria-label="统计范围"
        >
          <ElOption label="全部使用" value="AUDIT" />
          <ElOption label="我的使用" value="OWN" />
        </ElSelect>
        <ElSelect
          v-model="provider"
          clearable
          filterable
          placeholder="全部供应商"
          class="!w-44"
          aria-label="统计供应商"
        >
          <ElOption
            v-for="row in catalog.providers"
            :key="String(row.providerCode)"
            :label="String(row.providerCode || '未记录')"
            :value="String(row.providerCode || '')"
          />
        </ElSelect>
        <ElSelect
          v-model="model"
          clearable
          filterable
          placeholder="全部模型"
          class="!w-56"
          aria-label="统计模型"
        >
          <ElOption
            v-for="row in modelOptions"
            :key="`${row.modelRef}-${row.providerCode}`"
            :label="String(row.modelCode || row.modelRef || '未记录')"
            :value="String(row.modelRef || '')"
          />
        </ElSelect>
        <ElSelect v-model="period" class="!w-36" aria-label="统计时间">
          <ElOption label="今天" value="today" />
          <ElOption label="最近7天" value="week" />
          <ElOption label="最近30天" value="month" />
          <ElOption label="自定义" value="custom" />
        </ElSelect>
        <ElDatePicker
          v-if="period === 'custom'"
          v-model="range"
          type="datetimerange"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
        />
        <ElButton :loading="loading" @click="load">刷新</ElButton>
      </div>
      <ElAlert v-if="error" :title="error" type="error" :closable="false" />
      <div
        v-loading="loading"
        class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <ElCard shadow="never">
          <ElStatistic title="实报费用" :value="0" :formatter="() => cost" />
          <p class="mt-2 text-xs text-muted-foreground">各币种独立汇总</p>
        </ElCard>
        <ElCard shadow="never">
          <ElStatistic title="上游调用数" :value="Number(totals.calls || 0)" />
          <p class="mt-2 text-xs text-muted-foreground">
            {{ value(totals.requests) }} 个业务请求 · 成功率
            {{ ratio(totals.succeeded, totals.calls) }}
          </p>
        </ElCard>
        <ElCard shadow="never">
          <ElStatistic
            title="真实消耗 Tokens"
            :value="0"
            :formatter="() => value(totals.totalTokens)"
          />
          <p class="mt-2 text-xs text-muted-foreground">
            已采集 {{ value(totals.tokenSamples) }} /
            {{ value(totals.calls) }} 次
          </p>
        </ElCard>
        <ElCard shadow="never">
          <ElStatistic
            title="缓存命中率"
            :value="0"
            :formatter="() => cacheRate"
          />
          <p class="mt-2 text-xs text-muted-foreground">
            缓存已采集 {{ value(totals.cacheSamples) }} 次
          </p>
        </ElCard>
      </div>
      <div class="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <ElCard
          v-for="item in [
            ['inputTokens', '输入 Tokens'],
            ['outputTokens', '输出 Tokens'],
            ['cacheWriteTokens', '缓存创建'],
            ['cacheReadTokens', '缓存命中'],
          ]"
          :key="item[0]"
          shadow="never"
          :body-style="{ padding: '14px 18px' }"
        >
          <span class="text-xs text-muted-foreground">{{ item[1] }}</span>
          <div class="mt-2 text-lg font-semibold">
            {{ value(totals[item[0] || '']) }}
          </div>
        </ElCard>
      </div>
      <ElButton link type="primary" @click="more = !more">
        {{ more ? '收起指标' : '更多指标' }}
      </ElButton>
      <div v-if="more" class="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <ElCard
          v-for="item in [
            ['firstOutputMs', '平均首输出 / ms'],
            ['firstOutputP95Ms', 'P95 首输出 / ms'],
            ['elapsedMs', '平均耗时 / ms'],
            ['elapsedP50Ms', 'P50 耗时 / ms'],
            ['elapsedP95Ms', 'P95 耗时 / ms'],
            ['outputTokensPerSecond', '平均生成 Tokens/s'],
            ['reasoningTokens', '推理 Tokens'],
            ['qualityScore', '用户评分 / 5'],
            ['ratings', '评价样本'],
          ]"
          :key="item[0]"
          shadow="never"
        >
          <span class="text-xs text-muted-foreground">{{ item[1] }}</span>
          <div class="mt-2 text-lg font-semibold">
            {{ value(totals[item[0] || ''], 2) }}
          </div>
        </ElCard>
      </div>
      <ElCard shadow="never">
        <template #header>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span>使用趋势</span>
            <div class="flex gap-2">
              <ElSelect
                v-if="metric === 'amount'"
                v-model="currency"
                class="!w-28"
              >
                <ElOption
                  v-for="row in currencies"
                  :key="String(row.currency)"
                  :label="String(row.currency)"
                  :value="String(row.currency)"
                />
              </ElSelect>
              <ElRadioGroup v-model="metric" size="small">
                <ElRadioButton value="totalTokens">Tokens</ElRadioButton>
                <ElRadioButton value="calls">请求</ElRadioButton>
                <ElRadioButton value="amount">费用</ElRadioButton>
              </ElRadioGroup>
            </div>
          </div>
        </template>
        <EchartsUI ref="chartRef" class="h-[280px]" />
      </ElCard>
      <ElCard shadow="never">
        <template #header>
          <ElRadioGroup v-model="dimension" size="small">
            <ElRadioButton value="models">模型对比</ElRadioButton>
            <ElRadioButton value="providers">供应商</ElRadioButton>
            <ElRadioButton value="scenes">任务场景</ElRadioButton>
            <ElRadioButton value="errors">异常分布</ElRadioButton>
          </ElRadioGroup>
        </template>
        <ElTable :data="comparison" max-height="480">
          <ElTableColumn label="名称" min-width="200">
            <template #default="{ row }">
              {{
                row.modelCode ||
                row.modelRef ||
                row.providerCode ||
                row.sceneKey ||
                row.code ||
                '未记录'
              }}
            </template>
          </ElTableColumn>
          <ElTableColumn
            v-if="dimension === 'models'"
            prop="providerCode"
            label="供应商"
            min-width="140"
          />
          <ElTableColumn
            prop="calls"
            :sort-method="sortBy('calls')"
            label="请求数"
            sortable
            min-width="100"
          >
            <template #default="{ row }">{{ value(row.calls) }}</template>
          </ElTableColumn>
          <template v-if="dimension !== 'errors'">
            <ElTableColumn
              v-if="dimension === 'models' || dimension === 'providers'"
              label="实报费用"
              min-width="155"
            >
              <template #default="{ row }">{{ comparisonCost(row) }}</template>
            </ElTableColumn>
            <ElTableColumn label="成功率" min-width="100">
              <template #default="{ row }">
                {{ ratio(row.succeeded, row.calls) }}
              </template>
            </ElTableColumn>
            <ElTableColumn
              prop="totalTokens"
              :sort-method="sortBy('totalTokens')"
              label="Tokens"
              sortable
              min-width="130"
            >
              <template #default="{ row }">
                {{ value(row.totalTokens) }}
              </template>
            </ElTableColumn>
            <ElTableColumn
              prop="firstOutputMs"
              :sort-method="sortBy('firstOutputMs')"
              label="首输出 / ms"
              sortable
              min-width="120"
            >
              <template #default="{ row }">
                {{ value(row.firstOutputMs, 0) }}
              </template>
            </ElTableColumn>
            <ElTableColumn
              prop="elapsedMs"
              :sort-method="sortBy('elapsedMs')"
              label="耗时 / ms"
              sortable
              min-width="120"
            >
              <template #default="{ row }">
                {{ value(row.elapsedMs, 0) }}
              </template>
            </ElTableColumn>
            <ElTableColumn
              prop="outputTokensPerSecond"
              :sort-method="sortBy('outputTokensPerSecond')"
              label="Tokens/s"
              sortable
              min-width="110"
            >
              <template #default="{ row }">
                {{ value(row.outputTokensPerSecond, 1) }}
              </template>
            </ElTableColumn>
            <ElTableColumn
              prop="qualityScore"
              :sort-method="sortBy('qualityScore')"
              label="用户评分"
              sortable
              min-width="130"
            >
              <template #default="{ row }">
                <ElTooltip :content="`${value(row.ratings)} 份真实评价`">
                  <span>{{ value(row.qualityScore, 2) }}</span>
                </ElTooltip>
              </template>
            </ElTableColumn>
          </template>
        </ElTable>
      </ElCard>
    </template>
  </section>
</template>
