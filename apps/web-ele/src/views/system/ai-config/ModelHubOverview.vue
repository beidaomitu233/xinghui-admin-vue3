<script setup lang="ts">
import type { HubModel, HubModelSummary } from '#/api/system/ai-model-hub';
import type { AiSettingsView } from '#/api/system/ai-settings';

import { computed, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElEmpty,
  ElPagination,
  ElTable,
  ElTableColumn,
} from 'element-plus';

const props = defineProps<{
  canAddModel: boolean;
  channels: AiSettingsView[];
  complete: boolean;
  models: HubModel[];
  summary?: HubModelSummary;
}>();
const emit = defineEmits<{
  addModel: [];
  selectModel: [id: string];
  selectSupplier: [id: string];
  suppliers: [];
  testModel: [id: string];
}>();
type Filter = 'all' | 'disabled' | 'needs' | 'protected' | 'ready' | 'weak';
const filter = ref<Filter>('all');
const page = ref(1);
const audit = ref(false);
const enabled = computed(() => props.models.filter((model) => model.enabled));
const ready = computed(() =>
  enabled.value.filter((model) => model.health.ready),
);
const needs = computed(() =>
  enabled.value.filter((model) => !model.health.ready),
);
const protectedModels = computed(() =>
  enabled.value.filter((model) => model.health.multiProviderProtected),
);
const weak = computed(() =>
  ready.value.filter((model) => !model.health.multiProviderProtected),
);
const disabled = computed(() => props.models.filter((model) => !model.enabled));
const verifiedKeyCount = computed(() =>
  props.channels.reduce(
    (count, channel) =>
      count +
      channel.keys.filter(
        (key) =>
          key.keyConfigured &&
          key.models.some((model) => model.status === 'SUCCEEDED'),
      ).length,
    0,
  ),
);
const keyCount = computed(() =>
  props.channels.reduce((count, channel) => count + channel.keys.length, 0),
);
const readyChannels = computed(() =>
  props.channels.filter(
    (channel) =>
      channel.active &&
      ['PARTIAL', 'SUCCEEDED'].includes(channel.connection?.status ?? '') &&
      channel.keys.some(
        (key) =>
          key.keyConfigured &&
          key.models.some((model) => model.status === 'SUCCEEDED'),
      ),
  ),
);
const keyIssue = computed(() =>
  props.channels.find(
    (channel) =>
      channel.keys.length === 0 ||
      channel.keys.some(
        (key) =>
          !key.keyConfigured ||
          !key.models.some((model) => model.status === 'SUCCEEDED'),
      ),
  ),
);
const filters = computed(() => [
  {
    value: 'all' as const,
    label: '全部',
    models: props.models,
    total: props.summary?.totalModels,
  },
  {
    value: 'ready' as const,
    label: '就绪',
    models: ready.value,
    total: props.summary?.readyModels,
  },
  {
    value: 'needs' as const,
    label: '待配置',
    models: needs.value,
    total: props.summary?.unconfiguredModels,
  },
  {
    value: 'weak' as const,
    label: '保障待完善',
    models: weak.value,
    total: props.summary
      ? Math.max(
          0,
          props.summary.readyModels - props.summary.multiProviderModels,
        )
      : undefined,
  },
  {
    value: 'protected' as const,
    label: '已保障',
    models: protectedModels.value,
    total: props.summary?.multiProviderModels,
  },
  {
    value: 'disabled' as const,
    label: '已停用',
    models: disabled.value,
    total: props.summary?.disabledModels,
  },
]);
const filtered = computed(
  () => filters.value.find((item) => item.value === filter.value)?.models ?? [],
);
const pageModels = computed(() =>
  filtered.value.slice((page.value - 1) * 20, page.value * 20),
);
watch([filter, () => props.models], () => {
  page.value = 1;
});
const noticeCount = computed(
  () =>
    Number(Boolean(keyIssue.value)) +
    Number(needs.value.length > 0) +
    Number(weak.value.length > 0),
);
function status(model: HubModel) {
  if (!model.enabled) return '已停用';
  return model.health.ready ? '就绪' : '待配置';
}
function assurance(model: HubModel) {
  if (!model.enabled) return '—';
  if (model.health.multiProviderProtected) return '多供应商';
  if (!model.health.ready) return '待接入';
  if (model.health.distinctProviders < 2) return '单供应商';
  return '自动切换关闭';
}
</script>

<template>
  <div class="hub-overview">
    <header class="overview-heading">
      <div>
        <h2>模型汇总</h2>
        <p>模型可用性与供应商接入状态</p>
      </div>
      <ElButton @click="audit = !audit">配置巡检</ElButton>
    </header>
    <ElAlert
      v-if="!complete"
      title="部分列表尚未读全；供应商统计与筛选结果仅含已读取项目，模型总览指标使用服务端汇总。"
      type="warning"
      :closable="false"
    />
    <ElAlert
      v-if="audit"
      :title="
        noticeCount
          ? `发现 ${noticeCount} 类待处理配置，请从右侧提醒继续处理。`
          : '已读取配置未发现待处理项。'
      "
      description="巡检只检查当前配置及已有验证记录，不发起模型或网络验证。"
      :type="noticeCount ? 'warning' : 'info'"
      closable
      @close="audit = false"
    />
    <div class="overview-metrics">
      <button type="button" @click="filter = 'ready'">
        <span>就绪模型</span>
        <strong>
          {{ summary?.readyModels ?? '—' }}
          <small>/ {{ summary?.totalModels ?? '—' }}</small>
        </strong>
        <em>{{ summary?.enabledModels ?? '—' }} 个已启用</em>
      </button>
      <button type="button" @click="emit('suppliers')">
        <span>{{ complete ? '可用渠道' : '可用渠道（已加载）' }}</span>
        <strong>
          {{ readyChannels.length }}
          <small>/ {{ channels.length }}</small>
        </strong>
        <em>按已有验证记录统计</em>
      </button>
      <button type="button" @click="filter = 'protected'">
        <span>多供应商保障</span>
        <strong>
          {{ summary?.multiProviderModels ?? '—' }}
          <small>/ {{ summary?.enabledModels ?? '—' }}</small>
        </strong>
        <em>{{ summary?.assuranceNeededModels ?? '—' }} 个待完善</em>
      </button>
      <button
        type="button"
        @click="
          keyIssue
            ? emit('selectSupplier', keyIssue.configId)
            : emit('suppliers')
        "
      >
        <span>已验证 API Key</span>
        <strong>
          {{ verifiedKeyCount }}
          <small>/ {{ keyCount }}</small>
        </strong>
        <em>未验证项不计入可用</em>
      </button>
    </div>
    <div class="overview-layout">
      <section class="overview-models">
        <div class="overview-section-heading">
          <h3>模型接入情况</h3>
          <span>{{ filtered.length }} 个模型</span>
        </div>
        <div class="overview-filters" aria-label="模型汇总筛选">
          <button
            v-for="item in filters"
            :key="item.value"
            type="button"
            :class="{ active: filter === item.value }"
            :aria-pressed="filter === item.value"
            @click="filter = item.value"
          >
            {{ item.label }}
            <span>{{ item.total ?? '—' }}</span>
          </button>
        </div>
        <ElTable
          v-if="filtered.length > 0"
          :data="pageModels"
          row-key="modelId"
          aria-label="模型接入汇总"
          class="overview-table"
        >
          <ElTableColumn label="模型 / 调用名称" min-width="170">
            <template #default="{ row }">
              <ElButton
                link
                type="primary"
                @click="emit('selectModel', row.modelId)"
              >
                {{ row.name }}
              </ElButton>
              <code class="overview-call-name">{{ row.slug }}</code>
            </template>
          </ElTableColumn>
          <ElTableColumn label="可用供应商" width="100">
            <template #default="{ row }">
              {{ row.health.distinctProviders }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="接入保障" min-width="110">
            <template #default="{ row }">
              <span
                :class="{ 'is-protected': row.health.multiProviderProtected }"
              >
                {{ assurance(row) }}
              </span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="状态" width="80">
            <template #default="{ row }">{{ status(row) }}</template>
          </ElTableColumn>
          <ElTableColumn label="操作" width="125">
            <template #default="{ row }">
              <ElButton
                link
                type="primary"
                @click="emit('selectModel', row.modelId)"
              >
                配置
              </ElButton>
              <ElButton
                link
                :disabled="!row.enabled || row.routes.length === 0"
                @click="emit('testModel', row.modelId)"
              >
                测试
              </ElButton>
            </template>
          </ElTableColumn>
        </ElTable>
        <ElPagination
          v-if="filtered.length > 20"
          v-model:current-page="page"
          :total="filtered.length"
          :page-size="20"
          layout="prev, pager, next"
        />
        <ElEmpty
          v-if="filtered.length === 0"
          :description="
            models.length > 0 ? '暂无符合条件的模型' : '还没有配置模型'
          "
          :image-size="64"
        >
          <ElButton v-if="models.length > 0" @click="filter = 'all'">
            查看全部模型
          </ElButton>
          <ElButton
            v-else-if="canAddModel"
            type="primary"
            @click="emit('addModel')"
          >
            添加模型
          </ElButton>
        </ElEmpty>
      </section>
      <aside class="overview-notices" aria-label="配置提醒">
        <h3>配置提醒</h3>
        <article v-if="keyIssue">
          <h4>Key 配置需处理</h4>
          <p>存在未配置或尚未验证成功的 Key。</p>
          <ElButton
            link
            type="primary"
            @click="emit('selectSupplier', keyIssue.configId)"
          >
            处理 Key →
          </ElButton>
        </article>
        <article v-if="needs.length > 0">
          <h4>模型等待接入</h4>
          <p>{{ needs.length }} 个已启用模型没有可用供应商。</p>
          <ElButton link type="primary" @click="filter = 'needs'">
            补充接入 →
          </ElButton>
        </article>
        <article v-if="weak.length > 0">
          <h4>完善备用供应商</h4>
          <p>{{ weak.length }} 个模型尚未形成自动切换保障。</p>
          <ElButton link type="primary" @click="filter = 'weak'">
            查看模型 →
          </ElButton>
        </article>
        <article v-if="disabled.length > 0">
          <h4>已停用模型</h4>
          <p>{{ disabled.length }} 个模型当前不参与调用。</p>
          <ElButton link @click="filter = 'disabled'">查看模型 →</ElButton>
        </article>
        <article v-if="!noticeCount && disabled.length === 0">
          <h4>当前配置无需处理</h4>
          <p>以已读取配置和已有验证记录为准。</p>
        </article>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.hub-overview {
  min-width: 0;
}

.overview-heading,
.overview-section-heading {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.overview-heading {
  margin-bottom: 24px;
}

.overview-heading h2 {
  font-size: 25px;
  font-weight: 600;
}

.overview-heading p,
.overview-section-heading span,
.overview-notices p {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.overview-heading p {
  margin-top: 8px;
}

.overview-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin: 24px 0 28px;
}

.overview-metrics button {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
  min-width: 0;
  padding: 16px;
  text-align: left;
  background: hsl(var(--muted) / 35%);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.overview-metrics button:hover {
  border-color: hsl(var(--primary) / 50%);
}

.overview-metrics span,
.overview-metrics em {
  font-size: 11px;
  font-style: normal;
  color: hsl(var(--muted-foreground));
}

.overview-metrics strong {
  font-size: 28px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.overview-metrics small {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.overview-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 210px;
  gap: 24px;
}

.overview-models {
  min-width: 0;
}

.overview-section-heading {
  margin-bottom: 16px;
}

.overview-section-heading h3,
.overview-notices h3 {
  font-size: 13px;
  font-weight: 600;
}

.overview-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 16px;
}

.overview-filters button {
  padding: 5px 8px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  border: 1px solid transparent;
  border-radius: 5px;
}

.overview-filters button.active {
  color: var(--hub-accent, hsl(var(--primary)));
  background: hsl(var(--primary) / 8%);
  border-color: hsl(var(--primary) / 25%);
}

.overview-filters span {
  margin-left: 4px;
  font-variant-numeric: tabular-nums;
}

.overview-table {
  font-size: 12px;
}

.overview-call-name {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.is-protected {
  color: hsl(var(--success));
}

.overview-notices article {
  padding: 18px 0;
  border-bottom: 1px solid hsl(var(--border));
}

.overview-notices h4 {
  font-size: 12px;
  font-weight: 500;
}

.overview-notices p {
  margin: 8px 0;
  line-height: 1.7;
}

@media (max-width: 1250px) {
  .overview-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .overview-notices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 20px;
  }

  .overview-notices h3 {
    grid-column: 1 / -1;
  }
}

@media (max-width: 850px) {
  .overview-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
