<script setup lang="ts">
import type { SceneDefinition, SceneModelOption } from '#/api/system/ai-scene';

import { computed, nextTick, ref } from 'vue';

import { promptDocument, singlePromptDocument } from './prompt-document';

const props = defineProps<{
  fields: Record<string, string>;
  models: SceneModelOption[];
  readonly: boolean;
  value: SceneDefinition;
  variables?: { label: string; name: string }[];
}>();
const emit = defineEmits<{ change: [value: SceneDefinition] }>();
const promptInput = ref<HTMLTextAreaElement>();
const document = computed(() => promptDocument(props.value));
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
  if (props.readonly || !props.variables?.some((item) => item.name === name))
    return;
  const input = promptInput.value;
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
function chooseModel(event: Event) {
  if (props.readonly) return;
  const option = props.models.find(
    (item) =>
      `${item.model.modelRef}:${item.model.configVersion}` ===
      (event.target as HTMLSelectElement).value,
  );
  if (option)
    change({
      ...props.value,
      modelPolicy: {
        ...props.value.modelPolicy,
        mode: 'FIXED',
        fallback: false,
        models: [
          {
            model: option.model,
            keyMode: 'AUTO',
            allowedKeys: [],
            fixedKey: null,
            fallbackKeys: [],
          },
        ],
      },
    });
}
function modelName(code: string) {
  if (code === 'poolside/laguna-s-2.1:free') return 'Poolside Laguna S 2.1';
  if (code === 'nvidia/nemotron-3.5-lightning:free')
    return 'NVIDIA Nemotron 3.5 Lightning';
  return code;
}
defineExpose({ insertVariable });
</script>
<template>
  <div class="prompt-editor">
    <div class="editor-meta">
      <label>
        场景名称
        <input
          :value="value.name"
          :readonly="readonly"
          maxlength="120"
          @input="update('name', ($event.target as HTMLInputElement).value)"
        />
        <span v-if="fields.name" class="field-error">{{ fields.name }}</span>
      </label>
      <label>
        用途（可选）
        <input
          :value="value.purpose"
          :readonly="readonly"
          @input="update('purpose', ($event.target as HTMLInputElement).value)"
        />
        <span v-if="fields.purpose" class="field-error">
          {{ fields.purpose }}
        </span>
      </label>
      <label>
        对话模型
        <select
          :disabled="readonly"
          :value="
            value.modelPolicy.models[0]
              ? `${value.modelPolicy.models[0].model.modelRef}:${value.modelPolicy.models[0].model.configVersion}`
              : ''
          "
          @change="chooseModel"
        >
          <option value="" disabled>选择已配置的模型</option>
          <option
            v-if="
              value.modelPolicy.models[0] &&
              !models.some(
                (item) =>
                  item.model.modelRef ===
                    value.modelPolicy.models[0]?.model.modelRef &&
                  item.model.configVersion ===
                    value.modelPolicy.models[0]?.model.configVersion,
              )
            "
            :value="`${value.modelPolicy.models[0].model.modelRef}:${value.modelPolicy.models[0].model.configVersion}`"
          >
            原模型当前不可用（保留原配置）
          </option>
          <option
            v-for="item in models"
            :key="`${item.model.modelRef}:${item.model.configVersion}`"
            :value="`${item.model.modelRef}:${item.model.configVersion}`"
          >
            {{ item.configName }} · {{ modelName(item.modelCode) }}
          </option>
        </select>
      </label>
    </div>
    <slot name="data"></slot>
    <p
      v-if="fields.dataObjects || fields.dataBindings"
      class="field-error"
      data-field-error="dataObjects"
    >
      {{ fields.dataBindings || fields.dataObjects }}
    </p>
    <p
      v-if="fields.modelPolicy"
      class="field-error"
      data-field-error="modelPolicy"
    >
      {{ fields.modelPolicy }}
    </p>
    <div class="variables">
      <span>插入引用</span>
      <button
        v-for="variable in variables"
        :key="variable.name"
        type="button"
        :disabled="readonly"
        @click="insertVariable(variable.name)"
      >
        {{ variable.label }}
      </button>
    </div>
    <label>
      提示词
      <textarea
        ref="promptInput"
        aria-label="提示词"
        :value="document"
        :readonly="readonly"
        placeholder="写下要完成的任务，并从数据选择器插入引用…"
        @input="updatePrompt(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
    </label>
    <p v-if="value.outputRequirement" class="historical-note">
      原有指令已合并显示，实际编辑后会一并保存。
    </p>
    <p v-if="fields.promptText || fields.outputRequirement" class="field-error">
      {{ fields.promptText || fields.outputRequirement }}
    </p>
  </div>
</template>
<style scoped>
.prompt-editor {
  display: grid;
  gap: 24px;
}

.editor-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

label {
  display: grid;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
}

input,
select,
textarea {
  width: 100%;
  padding: 11px 14px;
  font-weight: 400;
  color: inherit;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

textarea {
  min-height: 460px;
  line-height: 1.8;
  resize: vertical;
}

.variables {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  font-size: 12px;
}

.variables button {
  color: hsl(var(--primary));
}

.field-error {
  font-size: 12px;
  color: hsl(var(--destructive));
}

.historical-note {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

[readonly],
[disabled] {
  opacity: 0.75;
}

@media (max-width: 960px) {
  .editor-meta {
    grid-template-columns: 1fr;
  }
}
</style>
