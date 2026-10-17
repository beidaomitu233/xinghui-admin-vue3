<script setup lang="ts">
import type { SceneDefinition } from '#/api/system/ai-scene';
import type {
  SceneDataCatalog,
  SceneDataField,
  SceneDataForm,
} from '#/api/system/ai-scene-data';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import {
  sceneDataCatalog,
  sceneDataFields,
  sceneDataForms,
} from '#/api/system/ai-scene-data';

const props = defineProps<{
  fixedFormId: null | string;
  readonly: boolean;
  value: SceneDefinition['dataObjects'];
}>();
const emit = defineEmits<{
  change: [value: SceneDefinition['dataObjects']];
  variables: [value: { label: string; name: string }[]];
}>();
const access = useAccessStore();
const canRead = computed(() =>
  access.accessCodes.includes('lowcode:record:query'),
);
const catalog = ref<SceneDataCatalog>();
const forms = ref<SceneDataForm[]>([]);
const fields = ref<SceneDataField[]>([]);
const keyword = ref('');
const page = ref(1);
const total = ref('0');
const error = ref('');
const loading = ref(false);
const selectedForm = computed(
  () => props.fixedFormId ?? props.value[0]?.formId ?? '',
);
let generation = 0;
let formsGeneration = 0;
let disposed = false;
const variables = computed(() => [
  ...(catalog.value?.inputVariables ?? []).map((item) => ({
    label: item.label,
    name: item.name,
  })),
  ...fields.value
    .filter((item) =>
      props.value.some((object) => object.fields.includes(item.fieldKey)),
    )
    .map((item) => ({ label: item.label, name: item.variableName })),
]);
watch(variables, (value) => emit('variables', value), { immediate: true });
async function loadForms() {
  if (!canRead.value) return;
  const run = ++formsGeneration;
  try {
    const result = await sceneDataForms({
      keyword: keyword.value,
      pageNum: page.value,
      pageSize: 20,
    });
    if (!disposed && run === formsGeneration) {
      forms.value = result.records;
      total.value = result.total;
    }
  } catch {
    if (!disposed && run === formsGeneration)
      error.value = '表单读取失败，请重试。';
  }
}
async function loadFields() {
  const run = ++generation;
  fields.value = [];
  if (!selectedForm.value || !canRead.value) return;
  loading.value = true;
  try {
    const result = await sceneDataFields({
      objectKey: 'lowcode.record',
      formId: selectedForm.value,
    });
    if (!disposed && run === generation) fields.value = result.fields;
  } catch {
    if (!disposed && run === generation) error.value = '字段读取失败，请重试。';
  } finally {
    if (!disposed && run === generation) loading.value = false;
  }
}
function chooseForm(event: Event) {
  if (props.readonly || props.fixedFormId) return;
  const formId = (event.target as HTMLSelectElement).value;
  if (formId && !forms.value.some((form) => form.formId === formId)) return;
  emit(
    'change',
    formId ? [{ objectKey: 'lowcode.record', formId, fields: [] }] : [],
  );
}
function toggle(fieldKey: string, checked: boolean) {
  if (
    props.readonly ||
    !selectedForm.value ||
    !fields.value.some((field) => field.fieldKey === fieldKey)
  )
    return;
  const chosen = new Set(props.value[0]?.fields);
  if (checked) chosen.add(fieldKey);
  else chosen.delete(fieldKey);
  emit('change', [
    {
      objectKey: 'lowcode.record',
      formId: selectedForm.value,
      fields: [...chosen],
    },
  ]);
}
watch(selectedForm, loadFields);
watch(canRead, async (allowed) => {
  if (allowed) {
    await loadForms();
    await loadFields();
  } else {
    formsGeneration++;
    generation++;
    forms.value = [];
    fields.value = [];
  }
});
onMounted(async () => {
  try {
    const result = await sceneDataCatalog();
    if (!disposed) catalog.value = result;
  } catch {
    if (!disposed) error.value = '数据对象目录读取失败。';
  }
  if (!disposed && canRead.value) {
    await loadForms();
    await loadFields();
  }
});
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  formsGeneration++;
});
</script>
<template>
  <section class="data-selector" aria-label="数据对象与允许字段">
    <h2>数据对象与允许字段</h2>
    <p v-if="!canRead" class="hint">
      没有业务记录查询权限，可编辑不取数的普通提示词。
    </p>
    <template v-else>
      <p class="hint">
        {{
          catalog?.objects.find((item) => item.objectKey === 'lowcode.record')
            ?.name || '记录数据'
        }}
      </p>
      <form
        class="form-search"
        @submit.prevent="
          page = 1;
          loadForms();
        "
      >
        <input
          v-model="keyword"
          aria-label="搜索表单"
          placeholder="按表单名称搜索"
          maxlength="100"
        />
        <button type="submit">搜索</button>
      </form>
      <label>
        表单
        <select
          aria-label="数据表单"
          :disabled="readonly || Boolean(fixedFormId)"
          :value="selectedForm"
          @change="chooseForm"
        >
          <option value="">不使用业务数据</option>
          <option
            v-if="
              selectedForm &&
              !forms.some((form) => form.formId === selectedForm)
            "
            :value="selectedForm"
          >
            已绑定表单（当前候选不可用）
          </option>
          <option v-for="form in forms" :key="form.formId" :value="form.formId">
            {{ form.name }}
          </option>
        </select>
      </label>
      <div class="pages">
        <button
          type="button"
          :disabled="page <= 1"
          @click="
            page--;
            loadForms();
          "
        >
          上一页
        </button>
        <span>第 {{ page }} 页</span>
        <button
          type="button"
          :disabled="BigInt(page * 20) >= BigInt(total)"
          @click="
            page++;
            loadForms();
          "
        >
          下一页
        </button>
      </div>
      <p v-if="loading" role="status">正在读取允许字段…</p>
      <div v-else class="fields">
        <label v-for="field in fields" :key="field.fieldKey">
          <input
            type="checkbox"
            :disabled="readonly"
            :checked="
              value.some((object) => object.fields.includes(field.fieldKey))
            "
            @change="
              toggle(
                field.fieldKey,
                ($event.target as HTMLInputElement).checked,
              )
            "
          />
          {{ field.label }}
          <small>{{ field.type }}{{ field.nullable ? ' · 可为空' : '' }}</small>
        </label>
      </div>
    </template>
    <p v-if="error" role="alert">
      {{ error }}
      <button
        type="button"
        @click="
          error = '';
          loadForms();
          loadFields();
        "
      >
        重试
      </button>
    </p>
  </section>
</template>
<style scoped>
.data-selector {
  padding: 18px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

h2 {
  font-size: 13px;
  font-weight: 600;
}

.hint,
small,
.pages {
  margin: 10px 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.form-search,
.pages,
.fields {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  margin: 12px 0;
}

input:not([type='checkbox']),
select {
  padding: 8px 12px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

select {
  max-width: 100%;
  margin-left: 12px;
}

.fields label {
  display: flex;
  gap: 8px;
  align-items: center;
}

button {
  color: hsl(var(--primary));
}

button:disabled {
  opacity: 0.45;
}

[role='alert'] {
  font-size: 12px;
  color: #b66a19;
}
</style>
