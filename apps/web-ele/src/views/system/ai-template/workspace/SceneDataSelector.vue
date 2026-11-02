<script setup lang="ts">
import type { SceneDefinition } from '#/api/system/ai-scene';
import type {
  SceneDataCatalog,
  SceneDataField,
  SceneDataForm,
} from '#/api/system/ai-scene-data';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { Loading } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElCheckbox,
  ElForm,
  ElFormItem,
  ElOption,
  ElPagination,
  ElSelect,
} from 'element-plus';

import { useVbenForm } from '#/adapter/form';
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
const total = ref(0);
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
      const count = Number(result.total);
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error('Invalid total');
      total.value = count;
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
function chooseForm(formId: string) {
  if (props.readonly || props.fixedFormId) return;
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
const [QueryForm] = useVbenForm({
  submitButtonOptions: { content: '搜索' },
  resetButtonOptions: { show: false },
  showCollapseButton: false,
  layout: 'vertical',
  wrapperClass: 'grid-cols-1',
  handleSubmit: async (values) => {
    keyword.value = values.keyword ?? '';
    page.value = 1;
    await loadForms();
  },
  schema: [
    {
      component: 'Input',
      fieldName: 'keyword',
      label: '搜索表单',
      componentProps: {
        maxlength: 100,
        clearable: true,
        placeholder: '按表单名称搜索',
      },
    },
  ],
});
</script>
<template>
  <section class="space-y-4" aria-label="数据对象与允许字段">
    <h2 class="font-semibold">数据对象与允许字段</h2>
    <ElAlert
      v-if="!canRead"
      title="没有业务记录查询权限，可编辑不取数的普通提示词。"
      type="info"
      :closable="false"
    />
    <template v-else>
      <p class="text-muted-foreground">
        {{
          catalog?.objects.find((item) => item.objectKey === 'lowcode.record')
            ?.name || '记录数据'
        }}
      </p>
      <QueryForm />
      <ElForm label-position="top">
        <ElFormItem label="表单">
          <ElSelect
            :model-value="selectedForm"
            :disabled="readonly || Boolean(fixedFormId)"
            class="w-full"
            @change="chooseForm"
          >
            <ElOption value="" label="不使用业务数据" />
            <ElOption
              v-if="
                selectedForm &&
                !forms.some((form) => form.formId === selectedForm)
              "
              :value="selectedForm"
              label="已绑定表单（当前候选不可用）"
            />
            <ElOption
              v-for="form in forms"
              :key="form.formId"
              :value="form.formId"
              :label="form.name"
            />
          </ElSelect>
        </ElFormItem>
      </ElForm>
      <ElPagination
        v-model:current-page="page"
        :page-size="20"
        :total="total"
        layout="prev,pager,next"
        @current-change="loadForms"
      />
      <Loading :spinning="loading" text="正在读取允许字段…">
        <div class="flex flex-wrap gap-4">
          <ElCheckbox
            v-for="field in fields"
            :key="field.fieldKey"
            :disabled="readonly"
            :model-value="
              value.some((object) => object.fields.includes(field.fieldKey))
            "
            @change="toggle(field.fieldKey, $event === true)"
          >
            {{ field.label }}
            <small class="text-muted-foreground">
              {{ field.type }}{{ field.nullable ? ' · 可为空' : '' }}
            </small>
          </ElCheckbox>
        </div>
      </Loading>
    </template>
    <ElAlert v-if="error" :title="error" type="error" @close="error = ''">
      <ElButton
        link
        @click="
          error = '';
          loadForms();
          loadFields();
        "
      >
        重试
      </ElButton>
    </ElAlert>
  </section>
</template>
