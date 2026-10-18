<script setup lang="ts">
import type {
  CatalogModel,
  ModelCatalogPage,
} from '#/api/system/ai-model-catalog';
import type {
  AiSettingsView,
  ConnectionStatus,
} from '#/api/system/ai-settings';

import { computed } from 'vue';

import {
  ElAlert,
  ElButton,
  ElEmpty,
  ElSwitch,
  ElTable,
  ElTableColumn,
} from 'element-plus';

const props = defineProps<{
  boundModels: number;
  busy: boolean;
  canEdit: boolean;
  canEnable: boolean;
  canScan: boolean;
  canTest: boolean;
  catalog?: ModelCatalogPage;
  catalogError?: string;
  catalogLoading?: boolean;
  catalogStale?: boolean;
  channel: AiSettingsView;
  providerName: string;
}>();
const emit = defineEmits<{
  configure: [];
  configureKeys: [];
  page: [page: number];
  scan: [];
  test: [];
  toggle: [enabled: boolean];
}>();
const verifiedKeys = computed(
  () =>
    props.channel.keys.filter(
      (key) =>
        key.keyConfigured &&
        key.models.some((model) => model.status === 'SUCCEEDED'),
    ).length,
);
const canActivate = computed(() =>
  ['PARTIAL', 'SUCCEEDED'].includes(props.channel.connection?.status ?? ''),
);
function statusLabel(status?: ConnectionStatus) {
  if (status === 'SUCCEEDED') return '验证通过';
  if (status === 'PARTIAL') return '部分验证通过';
  if (status === 'FAILED') return '验证失败';
  if (status === 'RUNNING' || status === 'QUEUED') return '验证中';
  if (status === 'CANCELLED') return '已取消验证';
  if (status === 'INTERRUPTED') return '验证已中断';
  return '尚未验证';
}
function capabilities(model: CatalogModel) {
  const capabilities: string[] = [];
  if (model.inputModalities.includes('text')) capabilities.push('文本');
  if (model.inputModalities.includes('image')) capabilities.push('图像');
  if (model.inputModalities.includes('audio')) capabilities.push('音频');
  if (model.inputModalities.includes('video')) capabilities.push('视频');
  return capabilities.join(' / ') || '目录未提供';
}
function contextSize(value: CatalogModel['contextLength']) {
  if (value === null) return '目录未提供';
  const text = String(value);
  if (!/^\d+$/.test(text)) return '目录未提供';
  const count = BigInt(text);
  return count >= 1024n ? `${count / 1024n}K` : text;
}
const refreshedAt = computed(() => {
  const value = props.catalog?.refreshedAt;
  if (!value || Number.isNaN(Date.parse(value))) return '';
  return new Date(value).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  });
});
</script>

<template>
  <div class="hub-supplier">
    <header class="supplier-heading">
      <div>
        <div class="supplier-name">
          <h2>{{ providerName }}</h2>
          <ElButton
            v-if="canEdit"
            link
            :disabled="busy"
            @click="emit('configure')"
          >
            编辑渠道
          </ElButton>
        </div>
        <p class="supplier-subtitle">
          渠道
          <span>{{ channel.name }}</span>
        </p>
      </div>
      <div class="supplier-toggle">
        <span>{{ channel.active ? '已启用' : '已停用' }}</span>
        <ElSwitch
          :model-value="channel.active"
          :disabled="busy || !canEnable || (!channel.active && !canActivate)"
          aria-label="渠道启用状态"
          @change="emit('toggle', Boolean($event))"
        />
      </div>
    </header>
    <section class="supplier-keys" aria-label="API Key 配置">
      <div class="supplier-section-heading">
        <h3>
          API Key
          <span>{{ verifiedKeys }} / {{ channel.keys.length }} 已验证</span>
        </h3>
        <ElButton :disabled="busy" @click="emit('configureKeys')">
          {{ canEdit ? '配置 Key' : '查看 Key' }}
        </ElButton>
      </div>
      <div class="supplier-key-list">
        <div v-for="key in channel.keys" :key="key.keyId" class="supplier-key">
          <div class="supplier-key-name">
            <strong>{{ key.name }}</strong>
            <code>{{ key.maskedKey || '未配置' }}</code>
          </div>
          <span
            :class="{
              'is-verified':
                key.keyConfigured &&
                key.models.some((model) => model.status === 'SUCCEEDED'),
            }"
          >
            {{ statusLabel(key.status) }}
          </span>
        </div>
      </div>
    </section>
    <p class="supplier-endpoint">
      <span>API 地址</span>
      <code>{{ channel.endpointUrl }}</code>
    </p>
    <dl class="supplier-metadata">
      <div>
        <dt>目录模型</dt>
        <dd>{{ catalog?.total ?? '尚未获取' }}</dd>
      </div>
      <div>
        <dt>绑定业务模型</dt>
        <dd>{{ boundModels }}</dd>
      </div>
      <div>
        <dt>连接状态</dt>
        <dd>{{ statusLabel(channel.connection?.status) }}</dd>
      </div>
    </dl>
    <ElAlert
      v-if="channel.pendingChanges"
      title="修改待验证，当前仍使用已生效的原连接。"
      type="warning"
      :closable="false"
    />
    <div class="supplier-section-heading">
      <h3>
        可用模型
        <span>{{ catalog?.total ?? 0 }}</span>
      </h3>
      <div class="supplier-actions">
        <ElButton v-if="canTest" :disabled="busy" @click="emit('test')">
          测试连接
        </ElButton>
        <ElButton
          v-if="canScan"
          :disabled="busy"
          :loading="catalogLoading"
          @click="emit('scan')"
        >
          获取模型
        </ElButton>
      </div>
    </div>
    <ElAlert
      v-if="catalogError"
      :title="catalogError"
      type="warning"
      :closable="false"
    />
    <ElAlert
      v-if="catalogStale"
      title="目录对应的配置已有变化，请重新获取后选择上游模型。"
      type="warning"
      :closable="false"
    />
    <ElTable
      v-if="catalog?.records.length"
      :data="catalog.records"
      row-key="code"
      aria-label="渠道可用模型"
      class="supplier-catalog"
    >
      <ElTableColumn prop="name" label="模型名称" min-width="160" />
      <ElTableColumn label="上游模型 ID" min-width="200">
        <template #default="{ row }">
          <code>{{ row.code }}</code>
        </template>
      </ElTableColumn>
      <ElTableColumn label="能力" min-width="130">
        <template #default="{ row }">{{ capabilities(row) }}</template>
      </ElTableColumn>
      <ElTableColumn label="上下文" width="110">
        <template #default="{ row }">
          {{ contextSize(row.contextLength) }}
        </template>
      </ElTableColumn>
    </ElTable>
    <ElEmpty
      v-else
      :description="catalogLoading ? '正在读取目录' : '尚未获取模型目录'"
      :image-size="64"
    />
    <div v-if="catalog" class="supplier-catalog-footer">
      <p>
        目录元数据不代表连接验证{{
          refreshedAt ? ` · 更新于 ${refreshedAt}` : ''
        }}
      </p>
      <div class="supplier-actions">
        <ElButton
          link
          :disabled="catalogLoading || catalog.pageNum <= 1"
          @click="emit('page', catalog.pageNum - 1)"
        >
          上一页
        </ElButton>
        <span>第 {{ catalog.pageNum }} 页</span>
        <ElButton
          link
          :disabled="
            catalogLoading ||
            catalog.pageNum * catalog.pageSize >= catalog.total
          "
          @click="emit('page', catalog.pageNum + 1)"
        >
          下一页
        </ElButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hub-supplier {
  min-width: 0;
}

.supplier-heading,
.supplier-name,
.supplier-toggle,
.supplier-section-heading,
.supplier-actions,
.supplier-key,
.supplier-endpoint,
.supplier-catalog-footer {
  display: flex;
  gap: 12px;
  align-items: center;
}

.supplier-heading,
.supplier-section-heading,
.supplier-key,
.supplier-catalog-footer {
  justify-content: space-between;
}

.supplier-heading {
  align-items: flex-start;
}

.supplier-name {
  flex-wrap: wrap;
}

.supplier-name h2 {
  font-size: 25px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.supplier-subtitle,
.supplier-section-heading h3 span,
.supplier-toggle,
.supplier-key code,
.supplier-endpoint,
.supplier-metadata dt,
.supplier-catalog-footer {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.supplier-subtitle {
  margin-top: 8px;
}

.supplier-subtitle span {
  margin-left: 10px;
}

.supplier-section-heading {
  margin: 24px 0 16px;
}

.supplier-section-heading h3 {
  font-size: 14px;
  font-weight: 600;
}

.supplier-section-heading h3 span {
  margin-left: 10px;
  font-weight: 400;
}

.supplier-key-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.supplier-key {
  min-width: 0;
  padding: 12px;
  font-size: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.supplier-key-name {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  overflow-wrap: anywhere;
}

.supplier-key strong {
  font-weight: 500;
}

.is-verified {
  color: hsl(var(--success));
}

.supplier-endpoint {
  align-items: baseline;
  margin-top: 24px;
}

.supplier-endpoint span {
  flex-shrink: 0;
}

.supplier-endpoint code {
  min-width: 0;
  overflow-wrap: anywhere;
}

.supplier-metadata {
  display: flex;
  flex-wrap: wrap;
  gap: 36px;
  padding: 24px 0;
  border-bottom: 1px solid hsl(var(--border));
}

.supplier-metadata dt {
  margin-bottom: 6px;
}

.supplier-metadata dd {
  margin: 0;
  font-size: 13px;
}

.supplier-catalog {
  font-size: 12px;
}

.supplier-catalog code {
  overflow-wrap: anywhere;
}

.supplier-catalog-footer {
  flex-wrap: wrap;
  margin-top: 16px;
  font-size: 11px;
}

.supplier-actions {
  flex-wrap: wrap;
}

.supplier-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

@media (max-width: 1100px) {
  .supplier-key-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .supplier-heading {
    flex-direction: column;
  }
}
</style>
