<script setup lang="ts">
import type {
  CatalogModel,
  ModelCatalogPage,
} from '#/api/system/ai-model-catalog';
import type {
  AiSettingsView,
  ConnectionStatus,
} from '#/api/system/ai-settings';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import { ElAlert, ElButton, ElSwitch } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import {
  catalogError as formatCatalogError,
  getStoredCatalog,
} from '#/api/system/ai-model-catalog';

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

const access = useAccessStore();
const gridError = ref('');
let generation = 0;
let result = { items: [] as CatalogModel[], total: 0 };
const queryParameters = (
  page: { currentPage: number; pageSize: number },
  sort: { field?: string; order?: null | string },
) => ({
  pageNum: page.currentPage,
  pageSize: page.pageSize,
  ...(sort.order === 'asc' || sort.order === 'desc'
    ? { orderBy: sort.field, order: sort.order as 'asc' | 'desc' }
    : {}),
});
type GridQuery = {
  page: { currentPage: number; pageSize: number };
  sort: { field: string; order: 'asc' | 'desc' | null };
};
const [Grid, gridApi] = useVbenVxeGrid<CatalogModel>({
  gridOptions: {
    rowConfig: { keyField: 'code' },
    columns: [
      { field: 'name', title: '模型名称', minWidth: 160, sortable: true },
      {
        field: 'code',
        title: '上游模型 ID',
        minWidth: 200,
        sortable: true,
        slots: { default: 'code' },
      },
      { title: '能力', minWidth: 130, slots: { default: 'capabilities' } },
      {
        field: 'contextLength',
        title: '上下文',
        minWidth: 120,
        sortable: true,
        slots: { default: 'context' },
      },
    ],
    pagerConfig: { pageSize: 20, pageSizes: [10, 20, 50, 100] },
    sortConfig: { remote: true },
    toolbarConfig: {
      refresh: true,
      refreshOptions: { code: 'query' },
      custom: true,
    },
    proxyConfig: {
      sort: true,
      ajax: {
        query: async ({ page, sort }: GridQuery) => {
          const run = ++generation;
          let id = props.channel.configId;
          const token = access.accessToken;
          gridError.value = '';
          try {
            let parameters = queryParameters(page, sort);
            let value: Awaited<ReturnType<typeof getStoredCatalog>> | undefined;
            let catalogVersion = props.catalog?.refreshedAt;
            for (;;) {
              let failure: unknown;
              try {
                value = await getStoredCatalog(id, parameters);
              } catch (error_) {
                failure = error_;
              }
              if (run !== generation || token !== access.accessToken)
                return result;
              const current = queryParameters(
                {
                  currentPage: gridApi.grid.getCurrentPage(),
                  pageSize: gridApi.grid.getPageSize(),
                },
                gridApi.grid.getSortColumns()[0] ?? {},
              );
              if (
                id !== props.channel.configId ||
                catalogVersion !== props.catalog?.refreshedAt ||
                JSON.stringify(current) !== JSON.stringify(parameters)
              ) {
                id = props.channel.configId;
                catalogVersion = props.catalog?.refreshedAt;
                parameters = current;
                continue;
              }
              if (failure) throw failure;
              if (!value) throw new Error('模型目录未返回结果');
              break;
            }
            if (
              run !== generation ||
              id !== props.channel.configId ||
              token !== access.accessToken
            )
              return result;
            return (result = {
              items: value.catalog.records,
              total: value.catalog.total,
            });
          } catch (error) {
            if (run !== generation) return result;
            result = { items: [], total: 0 };
            gridError.value = formatCatalogError(error);
            throw error;
          }
        },
      },
    },
  },
});
watch(
  () => props.channel.configId,
  () => {
    result = { items: [], total: 0 };
    gridApi.grid?.loadData?.([]);
    void gridApi.grid?.setCurrentPage?.(1)?.then(() => gridApi.query());
  },
);
watch(
  () => props.catalog,
  () => {
    void gridApi.query();
  },
);
onBeforeUnmount(() => {
  ++generation;
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
    <ElAlert v-if="gridError" :title="gridError" type="error" />
    <Grid>
      <template #code="{ row }">
        <code>{{ row.code }}</code>
      </template>
      <template #capabilities="{ row }">{{ capabilities(row) }}</template>
      <template #context="{ row }">
        {{ contextSize(row.contextLength) }}
      </template>
    </Grid>
    <div v-if="catalog" class="supplier-catalog-footer">
      <p>
        目录元数据不代表连接验证{{
          refreshedAt ? ` · 更新于 ${refreshedAt}` : ''
        }}
      </p>
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
