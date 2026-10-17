<script setup lang="ts">
import type { InputInstance } from 'element-plus';

import type { KeyReference, ModelBinding } from '#/api/system/ai-application';
import type { SceneDefinition, SceneModelOption } from '#/api/system/ai-scene';

import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElOption,
  ElSelect,
  ElTag,
} from 'element-plus';

import { sceneKeys } from '#/api/system/ai-scene';

import { promptDocument, singlePromptDocument } from './prompt-document';

const props = defineProps<{
  fields: Record<string, string>;
  models: SceneModelOption[];
  readonly: boolean;
  value: SceneDefinition;
  variables?: { label: string; name: string }[];
}>();
const emit = defineEmits<{ change: [value: SceneDefinition] }>();
const promptInput = ref<InputInstance>();
const document = computed(() => promptDocument(props.value));
const keyOptions = ref<
  Record<string, { key: KeyReference; maskedLabel: string }[]>
>({});
const keyLoading = ref(false);
const keyError = ref('');
let alive = true;
let generation = 0;
function modelId(model: ModelBinding['model']) {
  return `${model.modelRef}:${model.configVersion}`;
}
function keyId(key: KeyReference) {
  return `${key.keyRef}:${key.keyVersion}`;
}
const selectedModels = computed(() =>
  props.value.modelPolicy.models.map((binding) => modelId(binding.model)),
);
const modelChoices = computed(() => {
  const values: { id: string; label: string; option?: SceneModelOption }[] =
    props.models.map((option) => ({
      id: modelId(option.model),
      label: `${option.configName} · ${modelName(option.modelCode)}`,
      option,
    }));
  for (const binding of props.value.modelPolicy.models)
    if (!values.some((option) => option.id === modelId(binding.model)))
      values.push({
        id: modelId(binding.model),
        label: '已保存组合（当前暂不可用）',
      });
  return values;
});
function change(value: SceneDefinition) {
  if (!props.readonly) emit('change', singlePromptDocument(value));
}
function update(field: 'name' | 'purpose', value: string) {
  change({ ...props.value, [field]: value });
}
function updatePrompt(value: string) {
  if (!props.readonly)
    emit('change', {
      ...props.value,
      promptText: value,
      outputRequirement: '',
    });
}
async function insertVariable(name: string) {
  if (
    props.readonly ||
    !props.variables?.some((variable) => variable.name === name)
  )
    return;
  const input = promptInput.value?.textarea;
  const start = input?.selectionStart ?? document.value.length;
  const end = input?.selectionEnd ?? start;
  const token = `{{${name}}}`;
  const value =
    document.value.slice(0, start) + token + document.value.slice(end);
  updatePrompt(value);
  await nextTick();
  if (document.value === value) {
    input?.focus();
    input?.setSelectionRange(start + token.length, start + token.length);
  }
}
function updateModels(models: ModelBinding[]) {
  change({
    ...props.value,
    modelPolicy: {
      ...props.value.modelPolicy,
      mode: 'FIXED',
      fallback: true,
      models,
    },
  });
}
function chooseModels(values: string[]) {
  if (props.readonly) return;
  const previous = props.value.modelPolicy.models;
  const bindings = previous.filter((binding) =>
    values.includes(modelId(binding.model)),
  );
  for (const id of values) {
    if (bindings.some((binding) => modelId(binding.model) === id)) continue;
    const option = props.models.find((model) => modelId(model.model) === id);
    if (option)
      bindings.push({
        model: option.model,
        keyMode: 'AUTO',
        allowedKeys: [],
        fixedKey: null,
        fallbackKeys: [],
      });
  }
  updateModels(bindings);
}
function modelKeyChoices(binding: ModelBinding) {
  const options = [...(keyOptions.value[modelId(binding.model)] ?? [])];
  const pinned = [
    ...binding.allowedKeys,
    ...binding.fallbackKeys,
    ...(binding.fixedKey ? [binding.fixedKey] : []),
  ];
  for (const key of pinned)
    if (!options.some((option) => keyId(option.key) === keyId(key)))
      options.push({ key, maskedLabel: '已保存 Key（当前暂不可用）' });
  return options;
}
function selectedKeys(binding: ModelBinding) {
  if (binding.keyMode === 'FIXED')
    return [binding.fixedKey, ...binding.fallbackKeys].flatMap((key) =>
      key ? [keyId(key)] : [],
    );
  return binding.allowedKeys.length > 0
    ? binding.allowedKeys.map((key) => keyId(key))
    : (keyOptions.value[modelId(binding.model)] ?? []).map((option) =>
        keyId(option.key),
      );
}
function chooseKeys(index: number, values: string[]) {
  if (props.readonly) return;
  if (values.length === 0) {
    keyError.value = '每个组合至少保留一个可用 Key。';
    return;
  }
  const binding = props.value.modelPolicy.models[index];
  if (!binding) return;
  const options = keyOptions.value[modelId(binding.model)] ?? [];
  const allowedKeys = values.flatMap((value) => {
    const option = options.find((candidate) => keyId(candidate.key) === value);
    return option ? [option.key] : [];
  });
  if (allowedKeys.length !== values.length) return;
  updateModels(
    props.value.modelPolicy.models.map((item, position) =>
      position === index
        ? {
            ...item,
            keyMode: 'AUTO',
            allowedKeys,
            fixedKey: null,
            fallbackKeys: [],
          }
        : item,
    ),
  );
}
function moveModel(index: number, direction: number) {
  if (props.readonly) return;
  const next = index + direction;
  const models = [...props.value.modelPolicy.models];
  if (next < 0 || next >= models.length) return;
  const current = models[index];
  const other = models[next];
  if (!current || !other) return;
  models[index] = other;
  models[next] = current;
  updateModels(models);
}
async function loadKeys() {
  const run = ++generation;
  keyLoading.value = true;
  keyError.value = '';
  const missing = props.value.modelPolicy.models.filter(
    (binding) => !keyOptions.value[modelId(binding.model)],
  );
  const results = await Promise.allSettled(
    missing.map(async (binding) => ({
      id: modelId(binding.model),
      options: await sceneKeys(binding.model),
    })),
  );
  if (!alive || run !== generation) return;
  for (const result of results) {
    if (result.status === 'fulfilled')
      keyOptions.value[result.value.id] = result.value.options;
    else keyError.value = '部分 Key 候选暂未读到，已保存组合继续保留。';
  }
  keyLoading.value = false;
}
function modelName(code: string) {
  if (code === 'poolside/laguna-s-2.1:free') return 'Poolside Laguna S 2.1';
  if (code === 'nvidia/nemotron-3.5-lightning:free')
    return 'NVIDIA Nemotron 3.5 Lightning';
  return code;
}
watch(() => selectedModels.value.join('|'), loadKeys, { immediate: true });
onBeforeUnmount(() => {
  alive = false;
  generation++;
});
defineExpose({ insertVariable });
</script>
<template>
  <div class="prompt-editor">
    <ElForm label-position="top" class="prompt-metadata" :disabled="readonly">
      <ElFormItem label="场景名称" :error="fields.name" required>
        <ElInput
          :model-value="value.name"
          aria-label="场景名称"
          maxlength="120"
          @update:model-value="update('name', $event)"
        />
      </ElFormItem>
      <ElFormItem label="用途" :error="fields.purpose">
        <ElInput
          :model-value="value.purpose"
          aria-label="场景用途"
          placeholder="可选，说明何时使用此场景"
          @update:model-value="update('purpose', $event)"
        />
      </ElFormItem>
      <ElFormItem
        label="渠道与模型"
        :error="fields.modelPolicy"
        class="model-form-item"
      >
        <ElSelect
          :model-value="selectedModels"
          aria-label="渠道与模型"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          placeholder="选择一个或多个已启用的渠道模型"
          @update:model-value="chooseModels"
        >
          <ElOption
            v-for="option in modelChoices"
            :key="option.id"
            :label="option.label"
            :value="option.id"
          />
        </ElSelect>
      </ElFormItem>
    </ElForm>
    <div
      v-if="value.modelPolicy.models.length > 0"
      class="model-priorities"
      aria-label="自动切换优先级"
    >
      <p class="prompt-hint">
        按下面的顺序优先使用可用组合；连接失败时，在本轮预算内自动尝试备用 Key
        或渠道。
      </p>
      <div
        v-for="(binding, index) in value.modelPolicy.models"
        :key="modelId(binding.model)"
        class="model-priority-row"
      >
        <ElTag :type="index === 0 ? 'primary' : 'info'" effect="plain">
          {{ index === 0 ? '优先使用' : `备用 ${index}` }}
        </ElTag>
        <strong>
          {{
            modelChoices.find((option) => option.id === modelId(binding.model))
              ?.label
          }}
        </strong>
        <ElSelect
          :model-value="selectedKeys(binding)"
          :aria-label="`组合 ${index + 1} 可用Key`"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          :disabled="readonly || keyLoading"
          :loading="keyLoading"
          placeholder="自动使用该模型的可用 Key"
          @update:model-value="chooseKeys(index, $event)"
        >
          <ElOption
            v-for="option in modelKeyChoices(binding)"
            :key="keyId(option.key)"
            :label="option.maskedLabel"
            :value="keyId(option.key)"
          />
        </ElSelect>
        <div class="priority-actions">
          <ElButton
            text
            :disabled="readonly || index === 0"
            :aria-label="`提高组合 ${index + 1} 优先级`"
            @click="moveModel(index, -1)"
          >
            上移
          </ElButton>
          <ElButton
            text
            :disabled="
              readonly || index === value.modelPolicy.models.length - 1
            "
            :aria-label="`降低组合 ${index + 1} 优先级`"
            @click="moveModel(index, 1)"
          >
            下移
          </ElButton>
        </div>
      </div>
    </div>
    <ElAlert
      v-if="keyError"
      :title="keyError"
      type="warning"
      closable
      @close="keyError = ''"
    />
    <div class="prompt-content">
      <aside class="prompt-data">
        <slot name="data"></slot>
        <p
          v-if="fields.dataObjects || fields.dataBindings"
          class="field-error"
          data-field-error="dataObjects"
        >
          {{ fields.dataBindings || fields.dataObjects }}
        </p>
      </aside>
      <section class="prompt-document">
        <div class="document-heading">
          <h2>提示词</h2>
          <span class="prompt-hint">点击数据引用名称即可插入</span>
        </div>
        <div class="prompt-variables">
          <ElButton
            v-for="variable in variables"
            :key="variable.name"
            size="small"
            plain
            :disabled="readonly"
            @click="insertVariable(variable.name)"
          >
            {{ variable.label }}
          </ElButton>
        </div>
        <ElInput
          ref="promptInput"
          type="textarea"
          :rows="22"
          aria-label="提示词"
          :model-value="document"
          :readonly="readonly"
          placeholder="描述要完成的任务，并从左侧插入所需的数据引用…"
          resize="vertical"
          @update:model-value="updatePrompt"
        />
        <p v-if="value.outputRequirement" class="prompt-hint">
          历史指令已完整合并到正文，实际编辑后一起保存。
        </p>
        <p
          v-if="fields.promptText || fields.outputRequirement"
          class="field-error"
        >
          {{ fields.promptText || fields.outputRequirement }}
        </p>
      </section>
    </div>
  </div>
</template>
<style scoped>
.prompt-editor {
  display: grid;
  gap: 20px;
  min-width: 0;
}

.prompt-metadata {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr) minmax(
      260px,
      1.6fr
    );
  gap: 20px;
}

.prompt-metadata :deep(.el-form-item) {
  margin-bottom: 0;
}

.prompt-metadata :deep(.el-select) {
  width: 100%;
}

.prompt-content {
  display: grid;
  grid-template-columns: minmax(270px, 320px) minmax(0, 1fr);
  gap: 28px;
  min-width: 0;
}

.prompt-data {
  min-width: 0;
  padding-right: 24px;
  border-right: 1px solid hsl(var(--border));
}

.prompt-document {
  display: grid;
  gap: 12px;
  align-content: start;
  min-width: 0;
}

.document-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

h2 {
  font-size: 15px;
  font-weight: 600;
}

.prompt-hint {
  font-size: 12px;
  line-height: 1.6;
  color: hsl(var(--muted-foreground));
}

.prompt-variables {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.prompt-variables :deep(.el-button) {
  margin: 0;
}

.prompt-document :deep(.el-textarea__inner) {
  font-size: 14px;
  line-height: 1.9;
}

.model-priorities {
  display: grid;
  gap: 10px;
  padding-bottom: 16px;
  border-bottom: 1px solid hsl(var(--border));
}

.model-priority-row {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 13px;
}

.model-priority-row strong {
  flex: 1;
  min-width: 0;
  font-weight: 500;
}

.model-priority-row :deep(.el-select) {
  width: 260px;
}

.priority-actions {
  display: flex;
}

.field-error {
  font-size: 13px;
  color: hsl(var(--destructive));
}

@media (max-width: 1100px) {
  .prompt-metadata {
    grid-template-columns: 1fr 1fr;
  }

  .model-form-item {
    grid-column: 1 / -1;
  }

  .model-priority-row {
    flex-wrap: wrap;
  }

  .model-priority-row :deep(.el-select) {
    flex: 1;
  }

  .prompt-content {
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 20px;
  }
}

@media (max-width: 800px) {
  .prompt-metadata {
    grid-template-columns: 1fr;
    gap: 14px;
  }

  .prompt-content {
    grid-template-columns: minmax(0, 1fr);
  }

  .prompt-data {
    padding: 0 0 20px;
    border-right: 0;
    border-bottom: 1px solid hsl(var(--border));
  }

  .model-priority-row strong {
    width: 75%;
  }
}
</style>
