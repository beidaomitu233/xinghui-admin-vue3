<script setup lang="ts">
import type { HubModel, HubModelRoute } from '#/api/system/ai-model-hub';
import type {
  AiSettingsView,
  SettingsProvider,
} from '#/api/system/ai-settings';

import { computed } from 'vue';

import {
  ElButton,
  ElCheckbox,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTable,
  ElTableColumn,
} from 'element-plus';

const props = defineProps<{
  busy: boolean;
  canEdit: boolean;
  canEnable: boolean;
  canTest: boolean;
  channels: AiSettingsView[];
  model: HubModel;
  providers: SettingsProvider[];
}>();
const emit = defineEmits<{
  addRoute: [];
  edit: [];
  editRoute: [routeId: string];
  fallback: [enabled: boolean];
  move: [index: number, direction: number];
  removeRoute: [routeId: string];
  routeEnabled: [routeId: string, enabled: boolean];
  strategy: [strategy: HubModel['strategy']];
  test: [];
  toggle: [enabled: boolean];
}>();
const status = computed(() => {
  if (!props.model.enabled) return '已停用';
  return props.model.health.ready ? '已就绪' : '待配置';
});
function providerName(route: HubModelRoute) {
  const code =
    route.health.providerCode ??
    props.channels.find((channel) => channel.configId === route.channelId)
      ?.provider;
  return (
    props.providers.find((provider) => provider.code === code)?.name ??
    code ??
    '来源说明未读到'
  );
}
function channelName(route: HubModelRoute) {
  return (
    route.health.channelName ??
    props.channels.find((channel) => channel.configId === route.channelId)
      ?.name ??
    '渠道当前不可读取'
  );
}
function keyCount(route: HubModelRoute) {
  const channel = props.channels.find(
    (item) => item.configId === route.channelId,
  );
  if (!channel) return '说明未读到';
  const keys = channel.keys.filter((key) =>
    key.modelCodes.includes(route.upstreamModel),
  );
  const verified = keys.filter(
    (key) =>
      key.keyConfigured &&
      key.models.some(
        (model) =>
          model.code === route.upstreamModel && model.status === 'SUCCEEDED',
      ),
  );
  return `${verified.length} / ${keys.length}`;
}
function routeStatus(route: HubModelRoute) {
  if (!route.enabled) return '已停用';
  return route.health.ready ? '可用' : '待配置或验证';
}
function changeStrategy(value: unknown) {
  if (value === 'PRIORITY' || value === 'ROUND_ROBIN') emit('strategy', value);
}
</script>

<template>
  <div class="hub-model">
    <header class="model-heading">
      <div>
        <div class="model-name">
          <h2>{{ model.name }}</h2>
          <ElButton v-if="canEdit" link :disabled="busy" @click="emit('edit')">
            编辑模型
          </ElButton>
        </div>
        <p class="model-call-name">
          <span>调用名称</span>
          <code>{{ model.slug }}</code>
        </p>
      </div>
      <div class="model-toggle">
        <span>{{ model.enabled ? '已启用' : '已停用' }}</span>
        <ElSwitch
          :model-value="model.enabled"
          :disabled="busy || !canEnable"
          aria-label="启用业务模型"
          @change="emit('toggle', Boolean($event))"
        />
      </div>
    </header>
    <dl class="model-metadata">
      <div>
        <dt>模型能力</dt>
        <dd>{{ model.capabilities || '未填写' }}</dd>
      </div>
      <div>
        <dt>上下文窗口</dt>
        <dd>{{ model.contextWindow || '未填写' }}</dd>
      </div>
      <div>
        <dt>可用供应商</dt>
        <dd>{{ model.health.distinctProviders }}</dd>
      </div>
      <div>
        <dt>调用状态</dt>
        <dd :class="{ 'is-ready': model.enabled && model.health.ready }">
          {{ status }}
        </dd>
      </div>
    </dl>
    <div class="model-section-heading">
      <h3>
        供应商配置
        <span>{{ model.routes.length }}</span>
      </h3>
      <ElButton v-if="canEdit" :disabled="busy" @click="emit('addRoute')">
        添加供应商
      </ElButton>
    </div>
    <ElTable
      :data="model.routes"
      row-key="routeId"
      aria-label="模型供应商"
      class="model-route-table"
    >
      <ElTableColumn label="优先级" width="95">
        <template #default="{ $index }">
          <div class="route-priority">
            <span>{{ String($index + 1).padStart(2, '0') }}</span>
            <div v-if="canEdit">
              <ElButton
                link
                :disabled="busy || $index === 0"
                :aria-label="`上移第 ${$index + 1} 个供应商`"
                @click="emit('move', $index, -1)"
              >
                ↑
              </ElButton>
              <ElButton
                link
                :disabled="busy || $index === model.routes.length - 1"
                :aria-label="`下移第 ${$index + 1} 个供应商`"
                @click="emit('move', $index, 1)"
              >
                ↓
              </ElButton>
            </div>
          </div>
        </template>
      </ElTableColumn>
      <ElTableColumn label="供应商 / 渠道" min-width="160">
        <template #default="{ row }">
          <strong>{{ providerName(row) }}</strong>
          <span class="model-cell-secondary">{{ channelName(row) }}</span>
        </template>
      </ElTableColumn>
      <ElTableColumn label="上游模型" min-width="175">
        <template #default="{ row }">
          <code>{{ row.upstreamModel }}</code>
        </template>
      </ElTableColumn>
      <ElTableColumn label="可用 Key" width="95">
        <template #default="{ row }">{{ keyCount(row) }}</template>
      </ElTableColumn>
      <ElTableColumn label="状态" min-width="115">
        <template #default="{ row }">
          <span :class="{ 'is-ready': row.enabled && row.health.ready }">
            {{ routeStatus(row) }}
          </span>
        </template>
      </ElTableColumn>
      <ElTableColumn label="启用" width="75">
        <template #default="{ row }">
          <ElSwitch
            :model-value="row.enabled"
            :disabled="busy || !canEdit"
            :aria-label="`${channelName(row)} 接入启用状态`"
            @change="emit('routeEnabled', row.routeId, Boolean($event))"
          />
        </template>
      </ElTableColumn>
      <ElTableColumn v-if="canEdit" label="操作" width="100">
        <template #default="{ row }">
          <ElButton
            link
            :disabled="busy"
            @click="emit('editRoute', row.routeId)"
          >
            编辑
          </ElButton>
          <ElButton
            link
            type="danger"
            :disabled="busy"
            @click="emit('removeRoute', row.routeId)"
          >
            移除
          </ElButton>
        </template>
      </ElTableColumn>
    </ElTable>
    <div class="model-routing-bar">
      <span>调用策略</span>
      <ElSelect
        :model-value="model.strategy"
        :disabled="busy || !canEdit"
        aria-label="业务模型调用策略"
        class="model-strategy"
        @change="changeStrategy"
      >
        <ElOption label="按优先级调用" value="PRIORITY" />
        <ElOption label="轮询调用" value="ROUND_ROBIN" />
      </ElSelect>
      <ElCheckbox
        :model-value="model.fallback"
        :disabled="busy || !canEdit"
        @change="emit('fallback', Boolean($event))"
      >
        失败时自动切换
      </ElCheckbox>
      <ElButton
        v-if="canTest"
        :disabled="busy || !model.enabled || model.routes.length === 0"
        @click="emit('test')"
      >
        测试调用
      </ElButton>
    </div>
    <footer class="model-detail-footer">
      <span>
        {{
          model.strategy === 'PRIORITY'
            ? '按优先级从上到下调用'
            : '在已启用且可用的供应商之间轮询'
        }}
      </span>
      <ElButton v-if="canEdit" link :disabled="busy" @click="emit('edit')">
        模型设置
      </ElButton>
    </footer>
  </div>
</template>

<style scoped>
.hub-model {
  min-width: 0;
}

.model-heading,
.model-name,
.model-toggle,
.model-call-name,
.model-section-heading,
.model-routing-bar,
.model-detail-footer {
  display: flex;
  gap: 12px;
  align-items: center;
}

.model-heading,
.model-section-heading,
.model-detail-footer {
  justify-content: space-between;
}

.model-heading {
  align-items: flex-start;
}

.model-name {
  flex-wrap: wrap;
}

.model-name h2 {
  font-size: 25px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.model-call-name {
  margin-top: 8px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.model-toggle {
  flex-shrink: 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.model-metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 38px;
  padding: 28px 0;
  border-bottom: 1px solid hsl(var(--border));
}

.model-metadata dt {
  margin-bottom: 6px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.model-metadata dd {
  margin: 0;
  font-size: 13px;
}

.is-ready {
  color: hsl(var(--success));
}

.model-section-heading {
  margin: 24px 0 18px;
}

.model-section-heading h3 {
  font-size: 14px;
  font-weight: 600;
}

.model-section-heading h3 span {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.model-route-table {
  font-size: 12px;
}

.model-route-table strong {
  font-weight: 500;
}

.model-route-table code {
  font-size: 11px;
  overflow-wrap: anywhere;
}

.model-cell-secondary {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.route-priority {
  display: flex;
  gap: 8px;
  align-items: center;
}

.route-priority > span {
  padding: 3px 5px;
  font-variant-numeric: tabular-nums;
  border: 1px solid hsl(var(--border));
  border-radius: 5px;
}

.route-priority > div {
  display: flex;
  flex-direction: column;
}

.route-priority :deep(.el-button) {
  min-height: 16px;
  padding: 0 4px;
  margin: 0;
}

.model-routing-bar {
  flex-wrap: wrap;
  padding: 20px 0;
  font-size: 12px;
}

.model-strategy {
  width: 170px;
}

.model-routing-bar > :deep(.el-button) {
  margin-left: auto;
}

.model-detail-footer {
  padding-top: 16px;
  margin-top: 20px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  border-top: 1px solid hsl(var(--border));
}

@media (max-width: 700px) {
  .model-heading {
    flex-direction: column;
  }
}
</style>
