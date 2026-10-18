<script setup lang="ts">
import type { HubSourceOption, ModelMetadata } from './model-hub-state';

import type { HubModel } from '#/api/system/ai-model-hub';

import { computed, reactive, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElDrawer,
  ElForm,
  ElFormItem,
  ElInput,
} from 'element-plus';

const props = defineProps<{
  busy: boolean;
  error: string;
  model?: HubModel;
  open: boolean;
  sources: HubSourceOption[];
  unknown: boolean;
}>();
const emit = defineEmits<{
  close: [];
  remove: [];
  save: [value: ModelMetadata];
  suppliers: [];
}>();
const form = reactive<ModelMetadata>({
  name: '',
  slug: '',
  capabilities: '',
  contextWindow: '',
  enabled: true,
});
let baseline = '';
const dirty = computed(() => JSON.stringify(form) !== baseline);
function selectSource(source: HubSourceOption) {
  if (props.busy || props.unknown) return;
  form.name = source.name;
  form.slug = (source.code.split('/').at(-1) ?? '')
    .replaceAll(/[^\w.:-]/g, '-')
    .slice(0, 80)
    .toLowerCase();
  form.capabilities = source.capabilities;
  form.contextWindow = source.contextWindow;
}
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const model = props.model;
    form.name = model?.name ?? '';
    form.slug = model?.slug ?? '';
    form.capabilities = model?.capabilities ?? '';
    form.contextWindow = model?.contextWindow ?? '';
    form.enabled = model?.enabled ?? true;
    baseline = JSON.stringify(form);
  },
  { immediate: true },
);
function submit() {
  if (props.busy) return;
  emit('save', {
    ...form,
    name: form.name.trim(),
    slug: form.slug.trim(),
    capabilities: form.capabilities.trim(),
    contextWindow: form.contextWindow.trim(),
  });
}
function beforeClose() {
  emit('close');
}
defineExpose({
  hasUnsaved: () => props.open && (dirty.value || props.unknown),
});
</script>

<template>
  <ElDrawer
    :model-value="open"
    :title="model ? '模型设置' : '添加模型'"
    size="min(680px, 100vw)"
    :close-on-click-modal="false"
    :before-close="beforeClose"
  >
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <section v-if="!model" class="model-source-options">
      <h3>从可用模型中选择</h3>
      <div v-if="sources.length > 0" class="model-source-list">
        <button
          v-for="source in sources"
          :key="source.code"
          type="button"
          :disabled="busy || unknown"
          @click="selectSource(source)"
        >
          <strong>{{ source.name }}</strong>
          <small>{{ source.code }}</small>
        </button>
      </div>
      <div v-else class="model-source-empty">
        <p>尚未获取可选模型，请先添加渠道并获取模型目录。</p>
        <ElButton :disabled="busy || unknown" @click="emit('suppliers')">
          查看供应商
        </ElButton>
      </div>
      <p>创建模型后再配置供应商，业务调用名称独立保留。</p>
    </section>
    <ElForm
      label-position="top"
      :disabled="busy || unknown"
      class="model-editor-form"
      @submit.prevent="submit"
    >
      <ElFormItem label="模型名称" required>
        <ElInput
          v-model="form.name"
          aria-label="业务模型名称"
          maxlength="50"
          placeholder="例如：客服对话模型"
        />
      </ElFormItem>
      <ElFormItem label="调用名称" required>
        <ElInput
          v-model="form.slug"
          :readonly="Boolean(model)"
          aria-label="业务模型调用名称"
          maxlength="80"
          placeholder="例如：customer-chat"
        />
        <p class="model-field-help">
          {{
            model
              ? '创建后保持稳定。'
              : '业务调用时使用此名称，上游模型 ID 在供应商绑定中配置。'
          }}
        </p>
      </ElFormItem>
      <div class="model-form-row">
        <ElFormItem label="模型能力">
          <ElInput
            v-model="form.capabilities"
            aria-label="业务模型能力"
            maxlength="100"
            placeholder="例如：对话 / 视觉"
          />
        </ElFormItem>
        <ElFormItem label="上下文窗口">
          <ElInput
            v-model="form.contextWindow"
            aria-label="业务模型上下文"
            maxlength="32"
            placeholder="例如：128K"
          />
        </ElFormItem>
      </div>
      <ElCheckbox v-model="form.enabled">启用模型</ElCheckbox>
    </ElForm>
    <template #footer>
      <div class="model-editor-footer">
        <ElButton
          v-if="model"
          link
          type="danger"
          :disabled="busy || unknown"
          @click="emit('remove')"
        >
          删除模型
        </ElButton>
        <div>
          <ElButton :disabled="busy" @click="emit('close')">取消</ElButton>
          <ElButton
            type="primary"
            :loading="busy"
            :disabled="
              busy || (!unknown && (!form.name.trim() || !form.slug.trim()))
            "
            @click="submit"
          >
            {{ unknown ? '重试原保存' : model ? '保存设置' : '创建模型' }}
          </ElButton>
        </div>
      </div>
    </template>
  </ElDrawer>
</template>

<style scoped>
.model-source-options {
  padding-bottom: 22px;
  margin-bottom: 22px;
  border-bottom: 1px solid hsl(var(--border));
}

.model-source-options h3 {
  margin-bottom: 14px;
  font-size: 13px;
  font-weight: 600;
}

.model-source-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  max-height: 230px;
  overflow: auto;
}

.model-source-list button {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 14px;
  text-align: left;
  border: 1px solid hsl(var(--border));
  border-radius: 7px;
}

.model-source-list button:hover {
  border-color: hsl(var(--primary));
}

.model-source-list strong {
  font-size: 13px;
  font-weight: 500;
}

.model-source-list small {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.model-source-options p,
.model-field-help {
  margin-top: 10px;
  font-size: 12px;
  line-height: 1.8;
  color: hsl(var(--muted-foreground));
}

.model-source-empty {
  padding: 14px;
  background: hsl(var(--muted) / 30%);
  border-radius: 7px;
}

.model-source-empty :deep(.el-button) {
  margin-top: 12px;
}

.model-form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.model-editor-footer {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.model-editor-footer > div {
  margin-left: auto;
}
</style>
