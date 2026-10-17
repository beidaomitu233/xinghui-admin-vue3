<script setup lang="ts">
import type { SceneDefinition, SceneModelOption } from '#/api/system/ai-scene';

import { nextTick, ref } from 'vue';

const props = defineProps<{
  fields: Record<string, string>;
  models: SceneModelOption[];
  readonly: boolean;
  value: SceneDefinition;
  variables?: { label: string; name: string }[];
}>();
const emit = defineEmits<{ change: [value: SceneDefinition] }>();
const promptInput = ref<HTMLTextAreaElement>();
async function insertVariable(name: string) {
  if (props.readonly || !props.variables?.some((item) => item.name === name))
    return;
  const input = promptInput.value;
  const start = input?.selectionStart ?? props.value.promptText.length;
  const end = input?.selectionEnd ?? start;
  const token = `{{${name}}}`;
  update(
    'promptText',
    props.value.promptText.slice(0, start) +
      token +
      props.value.promptText.slice(end),
  );
  await nextTick();
  input?.focus();
  input?.setSelectionRange(start + token.length, start + token.length);
}
function update(
  field: 'name' | 'outputRequirement' | 'promptText' | 'purpose',
  value: string,
) {
  if (!props.readonly) emit('change', { ...props.value, [field]: value });
}
function chooseModel(event: Event) {
  if (props.readonly) return;
  const option = props.models.find(
    (item) =>
      `${item.model.modelRef}:${item.model.configVersion}` ===
      (event.target as HTMLSelectElement).value,
  );
  if (!option) return;
  emit('change', {
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
function updatePolicy(
  field: 'maxAttempts' | 'maxConcurrent' | 'maxTokens' | 'timeoutSeconds',
  event: Event,
) {
  if (props.readonly) return;
  const value = (event.target as HTMLInputElement).valueAsNumber;
  if (!Number.isSafeInteger(value)) return;
  emit('change', {
    ...props.value,
    modelPolicy: { ...props.value.modelPolicy, [field]: value },
  });
}
function outputFormat(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (!props.readonly && (value === 'TEXT' || value === 'JSON_OBJECT'))
    emit('change', {
      ...props.value,
      modelPolicy: { ...props.value.modelPolicy, outputFormat: value },
    });
}
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
        用途
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
        模型
        <select
          :disabled="readonly"
          :value="
            value.modelPolicy.models[0]
              ? `${value.modelPolicy.models[0].model.modelRef}:${value.modelPolicy.models[0].model.configVersion}`
              : ''
          "
          @change="chooseModel"
        >
          <option value="" disabled>选择模型</option>
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
            当前模型暂不可用（保留配置）
          </option>
          <option
            v-for="item in models"
            :key="`${item.model.modelRef}:${item.model.configVersion}`"
            :value="`${item.model.modelRef}:${item.model.configVersion}`"
          >
            {{ item.configName }} · {{ item.modelCode }}
          </option>
        </select>
      </label>
    </div>
    <details>
      <summary>调用设置</summary>
      <div class="editor-meta policy">
        <label>
          输出格式
          <select
            :value="value.modelPolicy.outputFormat"
            :disabled="readonly"
            @change="outputFormat"
          >
            <option value="TEXT">文本</option>
            <option value="JSON_OBJECT">JSON 对象</option>
          </select>
        </label>
        <label>
          超时（秒）
          <input
            type="number"
            min="1"
            :value="value.modelPolicy.timeoutSeconds"
            :readonly="readonly"
            @change="updatePolicy('timeoutSeconds', $event)"
          />
        </label>
        <label>
          最多尝试次数
          <input
            type="number"
            min="1"
            :value="value.modelPolicy.maxAttempts"
            :readonly="readonly"
            @change="updatePolicy('maxAttempts', $event)"
          />
        </label>
        <label>
          最多并发
          <input
            type="number"
            min="1"
            :value="value.modelPolicy.maxConcurrent"
            :readonly="readonly"
            @change="updatePolicy('maxConcurrent', $event)"
          />
        </label>
        <label>
          输出 Token 上限
          <input
            type="number"
            min="1"
            :value="value.modelPolicy.maxTokens"
            :readonly="readonly"
            @change="updatePolicy('maxTokens', $event)"
          />
        </label>
      </div>
      <p v-if="value.modelPolicy.models.length > 1" class="policy-hint">
        当前保留 {{ value.modelPolicy.models.length }} 个模型的{{
          value.modelPolicy.mode === 'ROUND_ROBIN' ? '轮询' : '固定'
        }}策略；重新选择模型将使用所选单模型。
      </p>
    </details>
    <slot name="data"></slot>
    <p
      v-if="fields.dataObjects"
      class="field-error"
      data-field-error="dataObjects"
    >
      {{ fields.dataObjects }}
    </p>
    <p
      v-if="fields.modelPolicy"
      class="field-error"
      data-field-error="modelPolicy"
    >
      {{ fields.modelPolicy }}
    </p>
    <div class="variables">
      <span>插入变量</span>
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
    <label class="prompt-label">
      提示词
      <textarea
        ref="promptInput"
        aria-label="提示词"
        :value="value.promptText"
        :readonly="readonly"
        placeholder="描述任务、语气与输出要求…"
        @input="
          update('promptText', ($event.target as HTMLTextAreaElement).value)
        "
      ></textarea>
    </label>
    <p v-if="fields.promptText" class="field-error">{{ fields.promptText }}</p>
    <details :open="Boolean(value.outputRequirement)">
      <summary>输出规则（可选）</summary>
      <textarea
        aria-label="输出规则"
        class="output"
        :value="value.outputRequirement"
        :readonly="readonly"
        placeholder="补充格式或长度要求"
        @input="
          update(
            'outputRequirement',
            ($event.target as HTMLTextAreaElement).value,
          )
        "
      ></textarea>
    </details>
    <p v-if="fields.outputRequirement" class="field-error">
      {{ fields.outputRequirement }}
    </p>
  </div>
</template>
<style scoped>
.prompt-editor {
  display: grid;
  gap: 24px;
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

.policy {
  margin-top: 16px;
}

.policy-hint {
  margin-top: 12px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.editor-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
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
  min-height: 420px;
  line-height: 1.8;
  resize: vertical;
}

textarea:focus,
input:focus,
select:focus {
  outline: 2px solid hsl(var(--primary) / 30%);
  outline-offset: 1px;
}

textarea.output {
  min-height: 120px;
  margin-top: 12px;
}

summary {
  font-size: 13px;
  cursor: pointer;
}

.field-error {
  font-size: 12px;
  color: #b66a19;
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
