<script setup lang="ts">
import type { RouteKeyOption } from './scene-routing-state';

import type { SceneModelOption, SceneModelPolicy } from '#/api/system/ai-scene';

import { computed } from 'vue';

import { ElButton, ElCheckbox, ElOption, ElSelect } from 'element-plus';

import {
  copyRoute,
  replaceRouteKeys,
  routeKeyChoices,
  routeKeyId,
  routeModelId,
  routeSelectedKeys,
} from './scene-routing-state';

const props = defineProps<{
  keys: Record<string, RouteKeyOption[]>;
  models: SceneModelOption[];
  readonly: boolean;
  value: SceneModelPolicy;
}>();
const emit = defineEmits<{ change: [value: SceneModelPolicy] }>();
const modelOptions = computed(() => {
  const options = props.models.map((model) => ({
    id: routeModelId(model.model),
    label: `${model.configName} · ${model.modelCode}`,
  }));
  for (const binding of props.value.models)
    if (!options.some((option) => option.id === routeModelId(binding.model)))
      options.push({
        id: routeModelId(binding.model),
        label: '已保存组合（当前不可用）',
      });
  return options;
});
function chooseModels(ids: string[]) {
  if (props.readonly || ids.length === 0) return;
  const policy = copyRoute(props.value);
  policy.models = policy.models.filter((binding) =>
    ids.includes(routeModelId(binding.model)),
  );
  for (const id of ids) {
    if (policy.models.some((binding) => routeModelId(binding.model) === id))
      continue;
    const model = props.models.find(
      (model) => routeModelId(model.model) === id,
    );
    if (model)
      policy.models.push({
        model: model.model,
        keyMode: 'AUTO',
        allowedKeys: [],
        fixedKey: null,
        fallbackKeys: [],
      });
  }
  emit('change', policy);
}
function move(index: number, delta: number) {
  if (props.readonly) return;
  const policy = copyRoute(props.value);
  const first = policy.models[index];
  const second = policy.models[index + delta];
  if (!first || !second) return;
  policy.models[index] = second;
  policy.models[index + delta] = first;
  emit('change', policy);
}
function chooseKeys(index: number, ids: string[]) {
  if (props.readonly || ids.length === 0) return;
  const policy = copyRoute(props.value);
  const binding = policy.models[index];
  if (!binding) return;
  const options = routeKeyChoices(
    binding,
    props.keys[routeModelId(binding.model)] ?? [],
  );
  const keys = ids.flatMap((id) => {
    const option = options.find((option) => routeKeyId(option.key) === id);
    return option ? [option.key] : [];
  });
  if (keys.length !== ids.length) return;
  policy.models[index] = replaceRouteKeys(binding, keys);
  emit('change', policy);
}
function setFallback(value: boolean) {
  if (!props.readonly)
    emit('change', { ...copyRoute(props.value), fallback: value });
}
</script>
<template>
  <div class="scene-route-editor">
    <ElSelect
      :model-value="value.models.map((binding) => routeModelId(binding.model))"
      aria-label="场景调用模型"
      multiple
      filterable
      :disabled="readonly"
      @update:model-value="chooseModels"
    >
      <ElOption
        v-for="option in modelOptions"
        :key="option.id"
        :value="option.id"
        :label="option.label"
      />
    </ElSelect>
    <div
      v-for="(binding, index) in value.models"
      :key="routeModelId(binding.model)"
      class="route-row"
    >
      <span class="route-priority">{{ index + 1 }}</span>
      <strong>
        {{
          modelOptions.find(
            (option) => option.id === routeModelId(binding.model),
          )?.label
        }}
      </strong>
      <ElSelect
        :aria-label="`调用组合 ${index + 1} 可用 Key`"
        :model-value="
          routeSelectedKeys(binding, keys[routeModelId(binding.model)] ?? [])
        "
        multiple
        collapse-tags
        collapse-tags-tooltip
        :disabled="readonly"
        @update:model-value="chooseKeys(index, $event)"
      >
        <ElOption
          v-for="option in routeKeyChoices(
            binding,
            keys[routeModelId(binding.model)] ?? [],
          )"
          :key="routeKeyId(option.key)"
          :value="routeKeyId(option.key)"
          :label="option.maskedLabel"
        />
      </ElSelect>
      <div class="route-order-actions">
        <ElButton
          text
          :disabled="readonly || index === 0"
          :aria-label="`提高调用组合 ${index + 1} 优先级`"
          @click="move(index, -1)"
        >
          上移
        </ElButton>
        <ElButton
          text
          :disabled="readonly || index === value.models.length - 1"
          :aria-label="`降低调用组合 ${index + 1} 优先级`"
          @click="move(index, 1)"
        >
          下移
        </ElButton>
      </div>
    </div>
    <ElCheckbox
      :model-value="value.fallback"
      :disabled="readonly"
      @update:model-value="setFallback($event === true)"
    >
      失败时在本轮预算内尝试后续可用组合
    </ElCheckbox>
  </div>
</template>
<style scoped>
.scene-route-editor {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.route-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid hsl(var(--border));
}

.route-priority {
  width: 22px;
  color: hsl(var(--muted-foreground));
}

.route-row strong {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.route-row :deep(.el-select) {
  width: 260px;
}

.route-order-actions {
  display: flex;
}

@media (max-width: 900px) {
  .route-row {
    flex-wrap: wrap;
  }

  .route-row :deep(.el-select) {
    flex: 1;
    width: auto;
    min-width: 180px;
  }
}
</style>
