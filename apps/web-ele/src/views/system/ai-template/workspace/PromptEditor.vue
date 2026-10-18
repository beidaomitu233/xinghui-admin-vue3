<script setup lang="ts">
import type { PromptVariable } from './prompt-tokens';

import type { ModelBinding } from '#/api/system/ai-application';
import type {
  SceneDefinition,
  SceneModelOption,
  SceneModelPolicy,
} from '#/api/system/ai-scene';

import { computed, ref } from 'vue';

import {
  ElButton,
  ElForm,
  ElFormItem,
  ElInput,
  ElOption,
  ElSelect,
} from 'element-plus';

import { promptDocument, singlePromptDocument } from './prompt-document';
import PromptTextEditor from './PromptTextEditor.vue';

const props = defineProps<{
  canConfigureRouting?: boolean;
  fields: Record<string, string>;
  initialModel?: boolean;
  models: SceneModelOption[];
  readonly: boolean;
  routingOverview?: SceneModelPolicy;
  saving?: boolean;
  value: SceneDefinition;
  variables?: PromptVariable[];
}>();
const emit = defineEmits<{
  change: [value: SceneDefinition];
  configure: [];
  refreshModels: [];
}>();
const editor = ref<InstanceType<typeof PromptTextEditor>>();
const document = computed(() => promptDocument(props.value));
function modelId(model: ModelBinding['model']) {
  return `${model.modelRef}:${model.configVersion}`;
}
const selectedModel = computed(() => {
  if (props.value.initialModel) return modelId(props.value.initialModel);
  const first = (props.routingOverview ?? props.value.modelPolicy).models[0];
  return first ? modelId(first.model) : '';
});
const choices = computed(() => {
  const options = props.models.map((option) => ({
    id: modelId(option.model),
    label: `${option.configName} · ${option.modelCode}`,
  }));
  if (
    selectedModel.value &&
    !options.some((option) => option.id === selectedModel.value)
  )
    options.push({
      id: selectedModel.value,
      label: '已保存模型（当前不可用）',
    });
  return options;
});
function update(field: 'name' | 'purpose', value: string) {
  if (!props.readonly)
    emit('change', singlePromptDocument({ ...props.value, [field]: value }));
}
function updatePrompt(value: string) {
  if (!props.readonly)
    emit('change', {
      ...props.value,
      promptText: value,
      outputRequirement: '',
    });
}
function chooseModel(id: string) {
  if (props.readonly || !props.initialModel || id === selectedModel.value)
    return;
  const option = props.models.find((model) => modelId(model.model) === id);
  if (!option) return;
  if (!props.saving)
    emit(
      'change',
      singlePromptDocument({ ...props.value, initialModel: option.model }),
    );
}
async function insertVariable(name: string) {
  await editor.value?.insertVariable(name);
}
defineExpose({ insertVariable });
</script>
<template>
  <div class="prompt-editor">
    <ElForm label-position="top" class="prompt-metadata">
      <ElFormItem label="场景名称" :error="fields.name" required>
        <ElInput
          :model-value="value.name"
          :readonly="readonly"
          aria-label="场景名称"
          maxlength="120"
          @update:model-value="update('name', $event)"
        />
      </ElFormItem>
      <ElFormItem label="用途" :error="fields.purpose">
        <ElInput
          :model-value="value.purpose"
          :readonly="readonly"
          aria-label="场景用途"
          placeholder="可选，简述使用场景"
          @update:model-value="update('purpose', $event)"
        />
      </ElFormItem>
      <ElFormItem label="使用模型" :error="fields.modelPolicy">
        <ElSelect
          v-if="initialModel"
          :model-value="selectedModel"
          :disabled="readonly || saving"
          aria-label="使用模型"
          filterable
          placeholder="选择已启用的渠道模型"
          @update:model-value="chooseModel"
          @visible-change="
            (visible) => {
              if (visible) emit('refreshModels');
            }
          "
        >
          <ElOption
            v-for="option in choices"
            :key="option.id"
            :label="option.label"
            :value="option.id"
          />
        </ElSelect>
        <div v-else class="model-summary">
          <span>
            {{
              choices.find((option) => option.id === selectedModel)?.label ||
              '尚未配置模型'
            }}{{
              (routingOverview ?? value.modelPolicy).models.length > 1
                ? ` · ${(routingOverview ?? value.modelPolicy).models.length} 个调用组合`
                : ''
            }}
          </span>
          <ElButton
            v-if="canConfigureRouting"
            link
            type="primary"
            @click="emit('configure')"
          >
            到 AI 配置调整
          </ElButton>
        </div>
      </ElFormItem>
    </ElForm>
    <section class="prompt-data" aria-label="数据引用说明">
      <slot name="data"></slot>
      <p
        v-if="fields.dataObjects || fields.dataBindings"
        class="field-error"
        data-field-error="dataObjects"
      >
        {{ fields.dataBindings || fields.dataObjects }}
      </p>
    </section>
    <section class="prompt-document">
      <h2>提示词</h2>
      <PromptTextEditor
        ref="editor"
        :model-value="document"
        :readonly="readonly"
        :variables="variables ?? []"
        @update:model-value="updatePrompt"
      />
      <p
        v-if="fields.promptText || fields.outputRequirement"
        class="field-error"
      >
        {{ fields.promptText || fields.outputRequirement }}
      </p>
    </section>
  </div>
</template>
<style scoped>
.prompt-editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}

.prompt-metadata {
  display: grid;
  flex-shrink: 0;
  grid-template-columns: minmax(150px, 1fr) minmax(150px, 1fr) minmax(
      220px,
      1.3fr
    );
  gap: 16px;
}

.prompt-metadata :deep(.el-form-item) {
  margin-bottom: 0;
}

.prompt-metadata :deep(.el-form-item__label) {
  padding: 0;
  margin-bottom: 6px;
}

.prompt-metadata :deep(.el-select) {
  width: 100%;
}

.model-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: center;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
}

.model-summary > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-data {
  flex-shrink: 0;
  min-width: 0;
  height: clamp(108px, 24vh, 200px);
  max-height: 34%;
  overflow: hidden;
}

.prompt-document {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
}

h2 {
  font-size: 14px;
  font-weight: 600;
}

.field-error {
  font-size: 12px;
  color: hsl(var(--destructive));
}

@media (max-width: 900px) {
  .prompt-metadata {
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .prompt-metadata :deep(.el-form-item:last-child) {
    grid-column: 1 / -1;
  }

  .prompt-data {
    max-height: 180px;
  }
}
</style>
