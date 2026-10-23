<script setup lang="ts">
import type { PromptVariable } from './prompt-tokens';

import type { DataBinding } from '#/api/system/ai-database';
import type { QueryBinding } from '#/api/system/ai-query';
import type { SceneDefinition } from '#/api/system/ai-scene';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import { ElAlert, ElButton, ElPopconfirm } from 'element-plus';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { databaseFields, databaseTables } from '#/api/system/ai-database';
import { getQuerySchema, validateQuery } from '#/api/system/ai-query';
import { sceneDataFields } from '#/api/system/ai-scene-data';

import { variableToken } from './prompt-tokens';

const props = defineProps<{
  bindings: DataBinding[];
  canAdd?: boolean;
  legacyObjects: SceneDefinition['dataObjects'];
  readonly: boolean;
  sqlBindings?: QueryBinding[];
}>();
const emit = defineEmits<{
  add: [];
  edit: [variable: string];
  insert: [variable: string];
  remove: [variable: string];
  variables: [variables: PromptVariable[]];
}>();
interface ReferenceRow extends PromptVariable {
  description: string;
  source: string;
  sourceDetail?: string;
  editable: boolean;
  removable: boolean;
}
const access = useAccessStore();
const legacyRows = ref<ReferenceRow[]>([]);
const error = ref('');
const sourceMetadata = ref<
  Record<string, { fields: Record<string, string>; label: string }>
>({});
const sqlScopes = ref<Record<string, string>>({});
const sqlColumns = ref<Record<string, string>>({});
const sqlDetails = ref<Record<string, string>>({});
const queryMetadataCache = new Map<
  string,
  Promise<{ columns: string; detail: string; text: string }>
>();
const metadataCache = new Map<
  string,
  Promise<{ fields: Record<string, string>; label: string }>
>();
let metadataGeneration = 0;
let metadataIdentity = '';
let lastVariables = '';
let generation = 0;
let alive = true;
const labels = {
  FIELD: '单条记录字段',
  ROW: '单条记录',
  TABLE: '多条记录',
  CHILDREN: '关联子记录',
};
const rows = computed<ReferenceRow[]>(() => [
  {
    name: 'user_request',
    label: '用户要求',
    description: '调用时由用户输入的问题或要求。',
    source: '本次用户输入，不查询数据库',
    editable: false,
    removable: false,
  },
  ...props.bindings.map((binding) => {
    const metadata = sourceMetadata.value[binding.sourceKey];
    const fields = binding.fields.map(
      (field) => metadata?.fields[field] || '字段说明未读取',
    );
    let range = binding.row?.currentRecord
      ? '本次业务记录'
      : '已保存的指定记录';
    if (['CHILDREN', 'TABLE'].includes(binding.mode))
      range = `最多 ${binding.limit} 行`;
    return {
      name: binding.variable,
      label: binding.label,
      description: `${labels[binding.mode]} · ${fields.length > 0 ? fields.join('、') : '保留已保存的字段范围'}`,
      source: `${metadata?.label || '历史来源说明未读取'} · ${range}`,
      editable: false,
      removable: true,
    };
  }),
  ...(props.sqlBindings ?? []).map((binding) => ({
    name: binding.variable,
    label: binding.label,
    description: [
      binding.description || '已保存的只读查询引用',
      sqlColumns.value[binding.variable],
    ]
      .filter(Boolean)
      .join(' · '),
    source:
      sqlScopes.value[binding.variable] ||
      '已保存查询 · 来源范围将在使用时重新校验',
    sourceDetail: sqlDetails.value[binding.variable],
    editable: true,
    removable: true,
  })),
  ...legacyRows.value,
]);
watch(
  rows,
  (next) => {
    const variables = next.map((row) => ({ name: row.name, label: row.label }));
    const signature = JSON.stringify(variables);
    if (signature !== lastVariables) {
      lastVariables = signature;
      emit('variables', variables);
    }
  },
  { immediate: true },
);
watch(
  () =>
    JSON.stringify([
      props.legacyObjects,
      access.accessCodes,
      access.accessToken,
      props.readonly,
    ]),
  async () => {
    const run = ++generation;
    legacyRows.value = [];
    error.value = '';
    if (props.readonly || !access.accessCodes.includes('lowcode:record:query'))
      return;
    const results = await Promise.allSettled(
      props.legacyObjects.map(async (object) => {
        if (!object.formId) return [];
        const metadata = await sceneDataFields({
          formId: object.formId,
          objectKey: object.objectKey,
        });
        return metadata.fields
          .filter((field) => object.fields.includes(field.fieldKey))
          .map((field) => ({
            name: field.variableName,
            label: field.label,
            description: '历史场景保存的业务字段',
            source: '当前业务记录 · 保留原授权范围',
            editable: false,
            removable: false,
          }));
      }),
    );
    if (!alive || run !== generation) return;
    legacyRows.value = results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    );
    if (results.some((result) => result.status === 'rejected'))
      error.value = '部分历史引用说明未读到，已保存定义仍保留。';
  },
  { immediate: true },
);
function readableSource(sourceKey: string) {
  const cached = metadataCache.get(sourceKey);
  if (cached) return cached;
  const task = (async () => {
    if (sourceKey.startsWith('lowcode.')) {
      const metadata = await sceneDataFields({
        formId: sourceKey.slice('lowcode.'.length),
        objectKey: 'lowcode.record',
      });
      return {
        label: '业务表单记录',
        fields: Object.fromEntries(
          metadata.fields.map((field) => [
            field.fieldKey,
            field.label === field.fieldKey ? '字段说明未提供' : field.label,
          ]),
        ),
      };
    }
    const tableName = sourceKey.startsWith('db.') ? sourceKey.slice(3) : '';
    const [metadata, tables] = await Promise.all([
      databaseFields(sourceKey),
      databaseTables({ keyword: tableName, pageNum: 1, pageSize: 100 }),
    ]);
    const table = tables.records.find((table) => table.sourceKey === sourceKey);
    return {
      label:
        table?.comment ||
        (table?.label === table?.tableName ? '' : table?.label) ||
        '数据库业务记录',
      fields: Object.fromEntries(
        metadata.fields.map((field) => [
          field.field,
          field.comment ||
            (field.label === field.field ? '' : field.label) ||
            '字段说明未提供',
        ]),
      ),
    };
  })();
  metadataCache.set(sourceKey, task);
  if (metadataCache.size > 64) {
    const oldest = metadataCache.keys().next().value;
    if (oldest) metadataCache.delete(oldest);
  }
  return task;
}
watch(
  () =>
    JSON.stringify([
      props.bindings.map((binding) => binding.sourceKey),
      props.sqlBindings,
      props.readonly,
      access.accessToken,
      access.accessCodes,
    ]),
  async () => {
    const run = ++metadataGeneration;
    sourceMetadata.value = {};
    sqlScopes.value = {};
    sqlDetails.value = {};
    sqlColumns.value = {};
    const actor = JSON.stringify([access.accessToken, access.accessCodes]);
    if (actor !== metadataIdentity) {
      metadataIdentity = actor;
      metadataCache.clear();
      queryMetadataCache.clear();
    }
    if (props.readonly) return;
    const sources = [
      ...new Set(props.bindings.map((binding) => binding.sourceKey)),
    ].filter((source) =>
      source.startsWith('lowcode.')
        ? access.accessCodes.includes('lowcode:record:query')
        : access.accessCodes.includes('ai:data:database:read'),
    );
    const results = await Promise.allSettled(
      sources.map(async (source) => ({
        source,
        metadata: await readableSource(source),
      })),
    );
    if (!alive || run !== metadataGeneration) return;
    for (const result of results)
      if (result.status === 'fulfilled')
        sourceMetadata.value[result.value.source] = result.value.metadata;
    for (const binding of props.sqlBindings ?? []) {
      if (!alive || run !== metadataGeneration) return;
      if (binding.datasetKeys.length === 0) {
        sqlScopes.value[binding.variable] =
          '历史查询范围，编辑后可更新实际来源';
        continue;
      }
      const key = JSON.stringify([binding.datasetKeys, binding.query]);
      let task = queryMetadataCache.get(key);
      if (!task) {
        task = Promise.all([
          getQuerySchema({
            datasetKeys: binding.datasetKeys,
            businessRef: null,
          }),
          validateQuery({
            datasetKeys: binding.datasetKeys,
            businessRef: null,
            query: binding.query,
          }),
        ]).then(([schema, validation]) => {
          if (!validation.valid) throw new Error('Query summary unavailable');
          return {
            text:
              schema.datasets
                .slice(0, 2)
                .map(
                  (dataset) =>
                    `${dataset.label} · ${{ PLATFORM: '平台授权', TENANT: '租户授权', PERSONAL: '个人授权' }[dataset.scope]}`,
                )
                .join('；') +
              (schema.datasets.length > 2
                ? ` 等 ${schema.datasets.length} 项来源`
                : ''),
            detail:
              schema.datasets
                .map(
                  (dataset) => `${dataset.label} · ${dataset.scopeDescription}`,
                )
                .join('；') || schema.scopeDescription,
            columns: validation.columns
              .map((column) => column.label || '字段说明未提供')
              .join('、'),
          };
        });
        queryMetadataCache.set(key, task);
        if (queryMetadataCache.size > 64) {
          const oldest = queryMetadataCache.keys().next().value;
          if (oldest) queryMetadataCache.delete(oldest);
        }
      }
      try {
        const summary = await task;
        if (!alive || run !== metadataGeneration) return;
        sqlScopes.value[binding.variable] = summary.text;
        sqlDetails.value[binding.variable] = summary.detail;
        sqlColumns.value[binding.variable] = summary.columns;
      } catch {
        queryMetadataCache.delete(key);
      }
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  alive = false;
  generation++;
  metadataGeneration++;
  metadataCache.clear();
  queryMetadataCache.clear();
});
const [Grid, gridApi] = useVbenVxeGrid<ReferenceRow>({
  gridOptions: {
    proxyConfig: { enabled: false },
    columns: [
      {
        title: '数据对象及说明',
        minWidth: 190,
        field: 'label',
        sortable: true,
        slots: { default: 'cell0' },
      },
      {
        title: '注入标识',
        minWidth: 190,
        field: 'name',
        sortable: true,
        slots: { default: 'cell1' },
      },
      {
        title: '查询来源与范围',
        minWidth: 190,
        field: 'source',
        sortable: true,
        slots: { default: 'cell2' },
      },
      { title: '操作', width: 140, slots: { default: 'cell3' } },
    ],
    pagerConfig: { enabled: false },
    toolbarConfig: { custom: true },
    rowConfig: { keyField: 'name' },
  },
});
watch(
  () => rows.value,
  (data) => gridApi.setGridOptions({ data }),
  { immediate: true, deep: true },
);
</script>
<template>
  <section class="data-reference-table" aria-label="数据引用">
    <header class="reference-heading">
      <h2>数据对象</h2>
      <ElButton
        v-if="!readonly"
        type="primary"
        link
        :disabled="!canAdd"
        @click="emit('add')"
      >
        添加引用
      </ElButton>
    </header>
    <Grid>
      <template #cell0="{ row }">
        <strong>{{ row.label }}</strong>
        <p>{{ row.description }}</p>
      </template>
      <template #cell1="{ row }">
        <code>{{ variableToken(row) }}</code>
      </template>
      <template #cell2="{ row }">
        <span :title="row.sourceDetail">{{ row.source }}</span>
      </template>
      <template #cell3="{ row }">
        <ElButton
          link
          type="primary"
          :disabled="readonly"
          @mousedown.prevent
          @click="emit('insert', row.name)"
        >
          插入
        </ElButton>
        <ElButton
          v-if="row.editable && !readonly"
          link
          @click="emit('edit', row.name)"
        >
          编辑
        </ElButton>
        <ElPopconfirm
          v-if="row.removable && !readonly"
          title="移除此引用？请同步检查正文中的注入标识。"
          confirm-button-text="移除"
          cancel-button-text="保留"
          @confirm="emit('remove', row.name)"
        >
          <template #reference>
            <ElButton link type="danger">移除</ElButton>
          </template>
        </ElPopconfirm>
      </template>
    </Grid>
    <ElAlert
      v-if="error"
      :title="error"
      type="warning"
      closable
      @close="error = ''"
    />
  </section>
</template>
<style scoped>
.data-reference-table {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  min-height: 0;
}

.reference-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

h2 {
  font-size: 14px;
  font-weight: 600;
}

.reference-table {
  flex: 1;
  min-height: 0;
  font-size: 12px;
}

.reference-table p {
  color: hsl(var(--muted-foreground));
}

.reference-table strong {
  font-weight: 500;
}

.reference-table code {
  color: hsl(var(--primary));
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

:global(.dark .reference-table code) {
  color: color-mix(in srgb, hsl(var(--primary)) 55%, white);
}

.reference-table :deep(.el-button + .el-button) {
  margin-left: 6px;
}
</style>
