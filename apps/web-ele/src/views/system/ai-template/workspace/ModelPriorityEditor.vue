<script setup lang="ts">
import type { Sortable } from '@vben/hooks';

import type { HubModel } from '#/api/system/ai-model-hub';
import type { SceneDefinition, SceneModelOption } from '#/api/system/ai-scene';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { useSortable } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';

import {
  ElButton,
  ElOption,
  ElPopover,
  ElSelect,
  ElTable,
  ElTableColumn,
  ElTag,
} from 'element-plus';

const props = defineProps<{
  legacyModels: SceneModelOption[];
  models: HubModel[];
  readonly: boolean;
  value: SceneDefinition;
}>();
const emit = defineEmits<{ change: [models: string[]] }>();
const choice = ref('');
const orderingVisible = ref(false);
const table = ref<InstanceType<typeof ElTable>>();
let sortable: Sortable | undefined;
let sortGeneration = 0;
function stopSorting() {
  sortGeneration++;
  sortable?.destroy();
  sortable = undefined;
}
async function startSorting() {
  stopSorting();
  const generation = sortGeneration;
  await nextTick();
  const body = table.value?.$el.querySelector('.el-table__body-wrapper tbody');
  if (!body || props.readonly) return;
  const { initializeSortable } = useSortable(body, {
    handle: '.model-drag-handle',
    draggable: '.el-table__row',
    animation: 150,
    onEnd(event) {
      const { oldDraggableIndex: from, newDraggableIndex: to } = event;
      if (from === undefined || to === undefined || from === to) return;
      // Restore Sortable's DOM move before Vue renders the changed keyed rows.
      event.item.remove();
      body.insertBefore(event.item, body.children[from] ?? null);
      if (props.readonly) return;
      const ordered = [...selected.value];
      const [slug] = ordered.splice(from, 1);
      if (!slug) return;
      ordered.splice(to, 0, slug);
      emit('change', ordered);
    },
  });
  const instance = await initializeSortable();
  if (generation === sortGeneration) {
    sortable = instance;
  } else {
    instance?.destroy();
  }
}
watch(
  () => props.readonly,
  () => sortable?.option('disabled', props.readonly),
);
onBeforeUnmount(stopSorting);
const selected = computed(() => {
  if (props.value.businessModels?.length) return props.value.businessModels;
  if (props.value.businessModel) return [props.value.businessModel];
  const ids: string[] = [];
  for (const binding of props.value.modelPolicy.models) {
    const source = props.legacyModels.find(
      (item) =>
        item.model.modelRef === binding.model.modelRef &&
        item.model.configVersion === binding.model.configVersion,
    );
    const card =
      source &&
      props.models.find((item) =>
        item.routes.some(
          (route) =>
            route.channelId === source.configId &&
            route.upstreamModel === source.modelCode,
        ),
      );
    if (card && !ids.includes(card.slug)) ids.push(card.slug);
  }
  return ids;
});
const rows = computed(() =>
  selected.value.map((slug) => ({
    slug,
    model: props.models.find((item) => item.slug === slug),
  })),
);
watch(
  () => rows.value.length,
  () => {
    if (orderingVisible.value) void startSorting();
  },
);
const summary = computed(
  () =>
    rows.value.map((row) => row.model?.name ?? row.slug).join(' → ') ||
    (props.value.modelPolicy.models.length > 0
      ? '已配置渠道模型'
      : '尚未选择模型'),
);
function add(slug: string) {
  if (!props.readonly && !selected.value.includes(slug))
    emit('change', [...selected.value, slug]);
  choice.value = '';
}
function remove(index: number) {
  if (!props.readonly && selected.value.length > 1)
    emit(
      'change',
      selected.value.filter((_, position) => position !== index),
    );
}
function move(index: number, offset: number) {
  if (props.readonly) return;
  const ordered = [...selected.value];
  const other = index + offset;
  if (other < 0 || other >= ordered.length) return;
  [ordered[index], ordered[other]] = [ordered[other]!, ordered[index]!];
  emit('change', ordered);
}
</script>

<template>
  <div class="model-selection" aria-label="模型调用顺序">
    <span class="model-selection-summary" :title="summary">{{ summary }}</span>
    <ElPopover
      v-model:visible="orderingVisible"
      trigger="click"
      placement="bottom-start"
      :width="680"
      :popper-style="{ maxWidth: 'calc(100vw - 48px)' }"
      @show="startSorting"
      @hide="stopSorting"
    >
      <template #reference>
        <ElButton>{{ readonly ? '查看调用顺序' : '选择模型与顺序' }}</ElButton>
      </template>
      <section class="model-priority">
        <div class="flex flex-wrap items-center gap-3">
          <ElSelect
            v-model="choice"
            :teleported="false"
            filterable
            placeholder="添加模型"
            aria-label="添加调用模型"
            :disabled="readonly"
            class="w-64"
            @change="add"
          >
            <ElOption
              v-for="model in models"
              :key="model.slug"
              :label="model.name"
              :value="model.slug"
              :disabled="selected.includes(model.slug) || !model.enabled"
            />
          </ElSelect>
          <span class="text-xs text-muted-foreground">
            拖动调整顺序，失败后自动切换下一模型
          </span>
        </div>
        <ElTable
          ref="table"
          v-if="rows.length > 0"
          :data="rows"
          row-key="slug"
          :max-height="240"
          size="small"
        >
          <ElTableColumn v-if="!readonly" width="38" align="center">
            <template #default="{ row }">
              <span
                class="model-drag-handle"
                :aria-label="`拖动排序 ${row.model?.name ?? row.slug}`"
                title="拖动排序"
              >
                <IconifyIcon icon="lucide:grip-vertical" class="size-4" />
              </span>
            </template>
          </ElTableColumn>
          <ElTableColumn label="顺序" width="70">
            <template #default="{ $index }">{{ $index + 1 }}</template>
          </ElTableColumn>
          <ElTableColumn label="模型" min-width="180">
            <template #default="{ row }">
              {{ row.model?.name ?? row.slug }}
            </template>
          </ElTableColumn>
          <ElTableColumn label="接入情况" width="160">
            <template #default="{ row }">
              <ElTag
                size="small"
                :type="row.model?.health.ready ? 'success' : 'info'"
              >
                {{
                  row.model?.health.ready
                    ? `${row.model.health.readyRoutes} 个可用渠道`
                    : '暂不可用'
                }}
              </ElTag>
            </template>
          </ElTableColumn>
          <ElTableColumn
            v-if="!readonly"
            label="操作"
            width="180"
            align="right"
          >
            <template #default="{ $index }">
              <ElButton
                link
                type="primary"
                :disabled="$index === 0"
                :aria-label="`上移模型 ${$index + 1}`"
                @click="move($index, -1)"
              >
                上移
              </ElButton>
              <ElButton
                link
                type="primary"
                :disabled="$index === rows.length - 1"
                :aria-label="`下移模型 ${$index + 1}`"
                @click="move($index, 1)"
              >
                下移
              </ElButton>
              <ElButton
                link
                type="danger"
                :disabled="rows.length === 1"
                :aria-label="`移除模型 ${$index + 1}`"
                @click="remove($index)"
              >
                移除
              </ElButton>
            </template>
          </ElTableColumn>
        </ElTable>
        <p
          v-else-if="value.modelPolicy.models.length > 0"
          class="text-xs text-muted-foreground"
        >
          当前渠道模型继续使用；选择模型后可在此调整调用顺序。
        </p>
      </section>
    </ElPopover>
  </div>
</template>

<style scoped>
.model-priority {
  display: grid;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.model-drag-handle {
  display: inline-flex;
  color: hsl(var(--muted-foreground));
  cursor: grab;
}

.model-drag-handle:active {
  cursor: grabbing;
}

.model-selection {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.model-selection-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  white-space: nowrap;
}
</style>
