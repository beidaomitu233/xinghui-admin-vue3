<script setup lang="ts">
import type { HubSourceOption, ModelMetadata } from './model-hub-state';

import type { HubModel } from '#/api/system/ai-model-hub';

import { computed, reactive, ref, watch } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';

import { ElAlert, ElButton, ElOption, ElSelect } from 'element-plus';

import { useVbenForm, z } from '#/adapter/form';

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
const selectedSource = ref('');
let baseline = '';
const dirty = computed(() => JSON.stringify(form) !== baseline);
const [Form, formApi] = useVbenForm({
  showDefaultActions: false,
  layout: 'vertical',
  wrapperClass: 'grid-cols-1',
  commonConfig: {
    componentProps: () => ({
      class: 'w-full',
      disabled: props.busy || props.unknown,
    }),
  },
  handleValuesChange: (values) => {
    Object.assign(form, values);
  },
  schema: [
    {
      component: 'Input',
      fieldName: 'name',
      label: '模型名称',
      rules: z.string().trim().min(1).max(50),
      componentProps: { maxlength: 50, placeholder: '例如：客服对话模型' },
    },
    {
      component: 'Input',
      fieldName: 'slug',
      label: '调用名称',
      rules: z.string().trim().min(1).max(80),
      componentProps: () => ({
        readonly: !!props.model,
        maxlength: 80,
        placeholder: '例如：customer-chat',
      }),
      description: () =>
        props.model
          ? '创建后保持稳定。'
          : '业务调用时使用此名称，上游模型 ID 在供应商绑定中配置。',
    },
    {
      component: 'Input',
      fieldName: 'capabilities',
      label: '模型能力',
      componentProps: { maxlength: 100, placeholder: '例如：对话 / 视觉' },
    },
    {
      component: 'Input',
      fieldName: 'contextWindow',
      label: '上下文窗口',
      componentProps: { maxlength: 32, placeholder: '例如：128K' },
    },
    {
      component: 'Checkbox',
      fieldName: 'enabled',
      label: '启用模型',
      defaultValue: true,
    },
  ],
});
const [Drawer, drawerApi] = useVbenDrawer({
  closeOnClickModal: false,
  onBeforeClose: () => {
    emit('close');
    return false;
  },
});
function selectSource(source: HubSourceOption) {
  if (props.busy || props.unknown) return;
  form.name = source.name;
  form.slug = (source.code.split('/').at(-1) ?? '')
    .replaceAll(/[^\w.:-]/g, '-')
    .slice(0, 80)
    .toLowerCase();
  form.capabilities = source.capabilities;
  form.contextWindow = source.contextWindow;
  void formApi.setValues(form);
}
watch(
  () => props.open,
  (open) => {
    drawerApi.setState({ isOpen: open });
    if (!open) return;
    selectedSource.value = '';
    const model = props.model;
    form.name = model?.name ?? '';
    form.slug = model?.slug ?? '';
    form.capabilities = model?.capabilities ?? '';
    form.contextWindow = model?.contextWindow ?? '';
    form.enabled = model?.enabled ?? true;
    baseline = JSON.stringify(form);
    void formApi.setValues(form);
  },
  { immediate: true },
);
async function submit() {
  if (props.busy) return;
  if (!props.unknown) {
    const validation = await formApi.validate();
    if (!validation.valid) return;
  }
  const values = await formApi.getValues();
  if (props.busy) return;
  Object.assign(form, values);
  emit('save', {
    ...form,
    name: form.name.trim(),
    slug: form.slug.trim(),
    capabilities: form.capabilities.trim(),
    contextWindow: form.contextWindow.trim(),
  });
}
defineExpose({
  hasUnsaved: () => props.open && (dirty.value || props.unknown),
});
</script>

<template>
  <Drawer :title="model ? '模型设置' : '添加模型'" class="w-full max-w-[680px]">
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <section v-if="!model" class="model-source-options">
      <h3>从可用模型中选择</h3>
      <ElSelect
        v-if="sources.length > 0"
        v-model="selectedSource"
        filterable
        :disabled="busy || unknown"
        class="w-full"
        placeholder="选择可用模型填入名称与能力"
        @change="
          (code) => {
            const source = sources.find((item) => item.code === code);
            if (source) selectSource(source);
          }
        "
      >
        <ElOption
          v-for="source in sources"
          :key="source.code"
          :value="source.code"
          :label="`${source.name} · ${source.code}`"
        />
      </ElSelect>
      <div v-else class="model-source-empty">
        <p>尚未获取可选模型，请先添加渠道并获取模型目录。</p>
        <ElButton :disabled="busy || unknown" @click="emit('suppliers')">
          查看供应商
        </ElButton>
      </div>
      <p>创建模型后再配置供应商，业务调用名称独立保留。</p>
    </section>
    <Form />
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
  </Drawer>
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
