<script setup lang="ts">
import type { PromptVariable } from './prompt-tokens';

import type { HubModel } from '#/api/system/ai-model-hub';
import type {
  SceneDefinition,
  SceneModelOption,
  SceneModelPolicy,
} from '#/api/system/ai-scene';

import { computed, ref, watch } from 'vue';

import { ElAlert } from 'element-plus';

import { useVbenForm, z } from '#/adapter/form';

import ModelPriorityEditor from './ModelPriorityEditor.vue';
import { promptDocument, singlePromptDocument } from './prompt-document';
import PromptTextEditor from './PromptTextEditor.vue';

const props = defineProps<{
  agent?: boolean;
  businessModelOverview?: null | string;
  businessModels?: HubModel[];
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
function updatePrompt(value: string) {
  if (!props.readonly)
    emit('change', {
      ...props.value,
      promptText: value,
      outputRequirement: '',
    });
}
function changeModels(models: string[]) {
  if (props.readonly || props.saving) return;
  emit(
    'change',
    singlePromptDocument({
      ...props.value,
      businessModels: models,
      businessModel: null,
      initialModel: null,
    }),
  );
}
async function insertVariable(name: string) {
  await editor.value?.insertVariable(name);
}
defineExpose({ insertVariable });
const metadata = () => ({
  name: props.value.name,
  purpose: props.value.purpose,
});
const [Form, formApi] = useVbenForm({
  showDefaultActions: false,
  layout: 'vertical',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: {
    formItemClass: 'pb-0',
    componentProps: () => ({ class: 'w-full', readonly: props.readonly }),
  },
  handleValuesChange: (values) => {
    if (props.readonly) return;
    const name = values.name ?? props.value.name;
    const purpose = values.purpose ?? props.value.purpose;
    if (name !== props.value.name || purpose !== props.value.purpose)
      emit('change', singlePromptDocument({ ...props.value, name, purpose }));
  },
  schema: [
    {
      component: 'Input',
      fieldName: 'name',
      label: '场景名称',
      rules: z.string().trim().min(1).max(120),
      componentProps: { maxlength: 120, 'aria-label': '场景名称' },
    },
    {
      component: 'Input',
      fieldName: 'purpose',
      label: '用途',
      componentProps: {
        placeholder: '可选，简述使用场景',
        'aria-label': '场景用途',
      },
    },
    {
      component: 'Input',
      fieldName: 'model',
      label: '使用模型',
      formItemClass: 'col-span-full',
    },
  ],
});
watch(
  () => JSON.stringify(metadata()),
  () => {
    void formApi.setValues(metadata());
  },
  { immediate: true },
);
</script>
<template>
  <div class="prompt-editor">
    <Form class="prompt-metadata">
      <template #model>
        <ModelPriorityEditor
          :value="value"
          :models="businessModels ?? []"
          :legacy-models="models"
          :readonly="readonly || Boolean(saving)"
          @change="changeModels"
        />
      </template>
    </Form>
    <ElAlert
      v-for="field in [
        'name',
        'purpose',
        'businessModel',
        'initialModel',
        'modelPolicy',
      ].filter((field) => fields[field])"
      :key="field"
      :data-field-error="field"
      :title="fields[field]"
      type="error"
      :closable="false"
    />
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
      <h2>{{ agent ? 'Agent 系统提示词' : '提示词' }}</h2>
      <PromptTextEditor
        ref="editor"
        :model-value="document"
        :readonly="readonly"
        :variables="variables ?? []"
        :placeholder="
          agent
            ? '定义助手职责、业务背景和执行偏好。具体任务在 AI 工作台输入。'
            : undefined
        "
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
  display: block;
  flex-shrink: 0;
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
