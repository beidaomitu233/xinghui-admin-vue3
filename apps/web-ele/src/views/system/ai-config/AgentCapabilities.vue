<script setup lang="ts">
import type { AgentCapability } from '#/api/system/ai-workbench';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElEmpty,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTooltip,
} from 'element-plus';

import { listAgentCapabilities } from '#/api/system/ai-workbench';

const access = useAccessStore();
const rows = ref<AgentCapability[]>([]);
const loading = ref(false);
const error = ref('');
let generation = 0;
let alive = true;
const allowed = computed(
  () =>
    Boolean(access.accessToken) &&
    access.accessCodes.includes('ai:agent:invoke'),
);
const labels: Record<string, string> = {
  query: '查询',
  get: '查看详情',
  create: '新增',
  update: '修改',
  delete: '删除',
  bulkCreate: '批量新增',
  bulkUpdate: '批量修改',
  bulkDelete: '批量删除',
  createType: '新增类型',
  updateType: '修改类型',
  createItem: '新增条目',
  updateItem: '修改条目',
  changeStatus: '切换状态',
  run: '执行任务',
  publish: '发布',
  markRead: '标记已读',
};
const operations = (row: AgentCapability, write: boolean) =>
  [...new Set([...(row.recordOperations || []), ...row.operations])]
    .filter((op) => write !== ['get', 'query'].includes(op))
    .map((op) => labels[op] || op)
    .join('、') || '—';
async function load() {
  const ticket = ++generation;
  rows.value = [];
  error.value = '';
  loading.value = false;
  if (!allowed.value) return;
  loading.value = true;
  try {
    const value = await listAgentCapabilities();
    if (alive && ticket === generation) rows.value = value;
  } catch {
    if (alive && ticket === generation)
      error.value = '工具列表读取失败，请重试。';
  } finally {
    if (alive && ticket === generation) loading.value = false;
  }
}
watch(() => [access.accessToken, ...access.accessCodes], load, {
  immediate: true,
});
onBeforeUnmount(() => {
  alive = false;
  generation++;
});
</script>
<template>
  <section aria-label="中台工具列表" class="mt-6 border-t pt-6">
    <h3 class="mb-2 text-sm font-medium">工具列表</h3>
    <p class="mb-4 text-sm text-muted-foreground">
      按当前账号权限实时读取。查询直接返回结果；新增、修改、删除和执行操作须先预览并确认。业务表单的记录操作以已发布表单及具体数据权限为准。
    </p>
    <ElEmpty
      v-if="!allowed"
      :image-size="60"
      description="当前账号无中台调用权限"
    />
    <ElAlert v-else-if="error" :title="error" type="error" :closable="false">
      <ElButton link @click="load">重试</ElButton>
    </ElAlert>
    <ElTable
      v-else
      v-loading="loading"
      :data="rows"
      row-key="resource"
      max-height="460"
      empty-text="当前账号暂无可用业务工具"
    >
      <ElTableColumn prop="name" label="业务能力" min-width="170" sortable>
        <template #default="{ row }">
          <ElTooltip
            :content="row.description || '当前账号授权范围'"
            placement="top"
          >
            <span>{{ row.name }}</span>
          </ElTooltip>
        </template>
      </ElTableColumn>
      <ElTableColumn label="可查询" min-width="100">
        <template #default="{ row }">{{ operations(row, false) }}</template>
      </ElTableColumn>
      <ElTableColumn label="可执行" min-width="220">
        <template #default="{ row }">{{ operations(row, true) }}</template>
      </ElTableColumn>
      <ElTableColumn label="执行方式" width="120">
        <template #default="{ row }">
          <ElTag :type="row.readOnly ? 'info' : 'warning'">
            {{ row.readOnly ? '只读' : '写入需确认' }}
          </ElTag>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>
