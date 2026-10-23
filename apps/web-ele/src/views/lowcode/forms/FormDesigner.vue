<script setup lang="ts">
import type { Config, DragRule } from '@form-create/designer';
import type { Rule } from '@form-create/element-ui';

import type { Component } from 'vue';

import type {
  FieldType,
  FieldValue,
  FormDefinition,
  FormDraft,
} from '#/api/lowcode/forms';

import {
  computed,
  getCurrentInstance,
  markRaw,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  toRaw,
  watch,
} from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import { useVbenForm, z } from '#/adapter/form';
import {
  createForm,
  getForm,
  publishForm,
  updateForm,
} from '#/api/lowcode/forms';

import { dataError, fieldTypes, initialData, newField } from '../form-schema';
import RuntimeFields from '../RuntimeFields.vue';
import { designerToSchema, schemaToDesigner } from './designer-schema';

const props = defineProps<{
  modelValue: boolean;
  readOnly?: boolean;
  source?: FormDefinition;
}>();
const emit = defineEmits<{
  saved: [];
  'update:modelValue': [value: boolean];
}>();
const app = getCurrentInstance()!.appContext.app;
const access = useAccessStore();
const can = (action: string) =>
  access.accessCodes.includes(`lowcode:form:${action}`);
const draft = ref<FormDraft>({
  name: '',
  formKey: '',
  status: 'draft',
  revision: 0,
  schema: { fields: [newField(1)] },
});
const formId = ref<string>();
const designerComponent = shallowRef<Component>();
type DesignerApi = {
  addComponent: (rules: DragRule[]) => void;
  getRule: () => unknown[];
  setRule: (rules: ReturnType<typeof schemaToDesigner>) => void;
};
const designer = ref<DesignerApi>();
const busy = ref(false);
const loaded = ref(false);
const failureText = ref('');
const previewData = ref<Record<string, FieldValue>>({});
let serial = 0;
const editable = computed(
  () => !props.readOnly && can(formId.value ? 'edit' : 'add'),
);
const [MetadataForm, metadataApi] = useVbenForm({
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  schema: [
    {
      fieldName: 'name',
      label: '表单名称',
      component: 'Input',
      componentProps: { maxlength: 100 },
      rules: z.string().trim().min(1, '请输入表单名称').max(100),
    },
    {
      fieldName: 'formKey',
      label: '表单标识',
      component: 'Input',
      componentProps: { maxlength: 50 },
      rules: z
        .string()
        .regex(
          /^[a-z][a-z0-9_]{0,49}$/u,
          '须以小写字母开头，仅支持小写字母、数字、下划线',
        ),
    },
  ],
});
const [Modal, modalApi] = useVbenModal({
  class: 'w-[min(1480px,96vw)]',
  showConfirmButton: false,
  closeOnClickModal: false,
  onOpenChange(open) {
    if (!open) {
      serial++;
      loaded.value = false;
      emit('update:modelValue', false);
    }
  },
});
const [PreviewModal, previewApi] = useVbenModal({
  title: '填写预览',
  class: 'w-[min(800px,94vw)]',
  confirmText: '验证填写',
  onConfirm() {
    const error = dataError(draft.value.schema, previewData.value);
    if (error) ElMessage.warning(error);
    else ElMessage.success('填写有效，预览不会保存数据');
  },
});
const config: Config = {
  showAi: false,
  showMenuBar: false,
  showSaveBtn: false,
  showPreviewBtn: false,
  showFormConfig: false,
  showBaseForm: true,
  showComponentName: false,
  showControl: false,
  showJsonPreview: false,
  showCustomProps: false,
  showEventForm: false,
  showValidateForm: false,
  showStyleForm: false,
  showInputData: false,
  showDevice: false,
  showLanguage: false,
  exitConfirm: false,
  switchType: false,
  fieldReadonly: false,
  updateConfigOnBlur: false,
  baseRule: () => baseRules(),
};
function baseRules(): Rule[] {
  return [
    {
      type: 'input',
      field: 'title',
      title: '字段名称',
      props: { maxlength: 100 },
    },
    {
      type: 'FieldInput',
      field: 'field',
      title: '字段标识',
      props: { maxlength: 50 },
    },
    {
      type: 'input',
      field: 'info',
      title: '填写帮助',
      props: { maxlength: 500 },
    },
  ];
}
const menu = [
  {
    name: 'lowcode',
    title: '字段组件',
    list: fieldTypes.map(({ value, label }) => ({
      name: `lowcode_${value}`,
      label,
      icon: 'icon-input',
    })),
  },
];
function newRule(type: FieldType) {
  const fields = designer.value?.getRule() ?? [];
  let index = 1;
  while (
    fields.some(
      (rule) => (rule as { field?: string }).field === `field_${index}`,
    )
  )
    index++;
  const field = newField(index);
  field.type = type;
  field.label = fieldTypes.find((entry) => entry.value === type)!.label;
  field.maxLength = type === 'textarea' ? 5000 : 200;
  if (['multiselect', 'select'].includes(type))
    field.options = [{ label: '选项1', value: 'option_1' }];
  return schemaToDesigner({ fields: [field] })[0]!;
}
function components(): DragRule[] {
  return fieldTypes.map(({ value: type, label }) => ({
    name: `lowcode_${type}`,
    label,
    icon: 'icon-input',
    languageKey: [],
    input: true,
    style: false,
    // Native copy generates incompatible identifiers; new fields use the business key factory.
    handleBtn: ['create', 'delete'],
    rule: () => newRule(type),
    props(rule) {
      const rules: ReturnType<DragRule['props']> = [
        { type: 'switch', field: 'formCreate$required', title: '必填' },
        { type: 'switch', field: 'formCreateListVisible', title: '列表显示' },
        ...(type === 'multiselect'
          ? []
          : [
              {
                type: 'switch',
                field: 'formCreateSearchable',
                title: '支持查询',
              },
            ]),
      ];
      const options = Array.isArray(rule.options) ? rule.options : [];
      if (['multiselect', 'select'].includes(type))
        rules.push({
          type: 'TableOptions',
          field: 'formCreateOptions',
          title: '选项',
          props: {
            column: [
              { label: '名称', key: 'label' },
              { label: '值', key: 'value' },
            ],
            keyValue: 'label',
          },
        });
      if (['text', 'textarea'].includes(type))
        rules.push({
          type: 'inputNumber',
          field: 'maxlength',
          title: '最大长度',
          props: { min: 1, max: type === 'textarea' ? 5000 : 2000 },
        });
      if (type === 'number')
        for (const [field, title] of [
          ['min', '最小值'],
          ['max', '最大值'],
        ])
          rules.push({
            type: 'inputNumber',
            field,
            title,
            props: { precision: 6, min: -1e12, max: 1e12 },
          });
      rules.push({
        type: rule.type,
        field: 'formCreateValue',
        title: '默认值',
        options,
        props: { ...rule.props },
      });
      return rules;
    },
  }));
}
async function initialize(run: number) {
  try {
    if (!designerComponent.value && editable.value) {
      const { installDesigner } = await import('./designer-loader');
      if (run !== serial) return;
      designerComponent.value = markRaw(installDesigner(app));
    }
    if (run !== serial) return;
    await nextTick();
    if (run !== serial) return;
    if (editable.value) {
      if (!designer.value) throw new Error('设计器未就绪');
      designer.value.addComponent(components());
      designer.value.setRule(schemaToDesigner(draft.value.schema));
    }
    metadataApi.setState({ commonConfig: { disabled: !editable.value } });
    await metadataApi.updateSchema([
      {
        fieldName: 'formKey',
        componentProps: { disabled: Boolean(formId.value) || !editable.value },
      },
    ]);
    await metadataApi.resetForm({
      values: { name: draft.value.name, formKey: draft.value.formKey },
    });
    if (run === serial) loaded.value = true;
  } catch {
    if (run === serial) failureText.value = '设计器加载失败，请关闭后重新打开';
  } finally {
    if (run === serial) modalApi.setState({ loading: false });
  }
}
watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      modalApi.close();
      return;
    }
    const run = ++serial;
    loaded.value = false;
    failureText.value = '';
    busy.value = false;
    const source = props.source;
    formId.value = source?.id;
    draft.value = source
      ? structuredClone({
          name: source.name,
          formKey: source.formKey,
          status: source.status,
          revision: source.revision,
          schema: toRaw(source.schema),
        })
      : {
          name: '',
          formKey: '',
          status: 'draft',
          revision: 0,
          schema: { fields: [newField(1)] },
        };
    modalApi.setState({
      title: props.readOnly ? '表单详情' : '表单设计',
      loading: true,
    });
    modalApi.open();
    void initialize(run);
  },
);
function captureSchema() {
  if (!editable.value || !designer.value) throw new Error('当前表单不可编辑');
  draft.value.schema = designerToSchema(
    designer.value.getRule(),
    draft.value.schema,
  );
}
function openPreview() {
  try {
    if (editable.value) captureSchema();
    previewData.value = initialData(draft.value.schema);
    previewApi.open();
  } catch (error) {
    ElMessage.warning((error as Error).message);
  }
}
async function save(): Promise<boolean> {
  if (busy.value || !loaded.value || !editable.value) return false;
  const run = serial;
  const result = await metadataApi.validate();
  if (!result.valid || run !== serial || !editable.value) return false;
  try {
    captureSchema();
  } catch (error) {
    ElMessage.warning((error as Error).message);
    return false;
  }
  const metadata = await metadataApi.getValues();
  if (run !== serial || !editable.value || busy.value) return false;
  const candidate = structuredClone({
    ...toRaw(draft.value),
    name: String(metadata.name).trim(),
    formKey: String(metadata.formKey),
  });
  busy.value = true;
  modalApi.lock();
  failureText.value = '';
  try {
    if (formId.value) {
      const saved = await updateForm(formId.value, candidate);
      if (run !== serial) return false;
      draft.value.revision = saved.revision;
      draft.value.status = saved.status;
    } else {
      const id = await createForm(candidate);
      if (run !== serial) return false;
      formId.value = id;
      await metadataApi.updateSchema([
        { fieldName: 'formKey', componentProps: { disabled: true } },
      ]);
    }
    draft.value.name = candidate.name;
    draft.value.formKey = candidate.formKey;
    emit('saved');
    ElMessage.success('草稿已保存');
    return true;
  } catch {
    if (run === serial)
      failureText.value = '保存未成功，草稿已保留。版本冲突时请重新读取。';
    return false;
  } finally {
    if (run === serial) {
      busy.value = false;
      modalApi.unlock();
    }
  }
}
async function publish() {
  if (!can('publish') || !editable.value || busy.value) return;
  const run = serial;
  try {
    await ElMessageBox.confirm(
      '发布后填写页将使用这个版本，是否继续？',
      '发布确认',
    );
  } catch {
    return;
  }
  if (run !== serial || !can('publish') || !(await save()) || !formId.value)
    return;
  busy.value = true;
  modalApi.lock();
  try {
    const saved = await publishForm(formId.value, draft.value.revision);
    if (run !== serial) return;
    draft.value.revision = saved.revision;
    draft.value.status = saved.status;
    emit('saved');
    ElMessage.success('表单已发布');
  } catch {
    if (run === serial)
      failureText.value =
        '发布未成功，已保存草稿仍保留。请检查版本冲突或字段兼容性。';
  } finally {
    if (run === serial) {
      busy.value = false;
      modalApi.unlock();
    }
  }
}
async function reload() {
  if (!formId.value || !can('query') || busy.value) return;
  const run = serial;
  const id = formId.value;
  try {
    await ElMessageBox.confirm(
      '重新读取将替换未保存的草稿，是否继续？',
      '重新读取确认',
    );
  } catch {
    return;
  }
  if (run !== serial || !can('query')) return;
  busy.value = true;
  modalApi.setState({ loading: true });
  try {
    const fresh = await getForm(id);
    if (run !== serial) return;
    draft.value = {
      name: fresh.name,
      formKey: fresh.formKey,
      status: fresh.status,
      revision: fresh.revision,
      schema: fresh.schema,
    };
    failureText.value = '';
    await initialize(run);
  } catch {
    if (run === serial) failureText.value = '读取失败，当前草稿已保留';
  } finally {
    if (run === serial) {
      busy.value = false;
      modalApi.setState({ loading: false });
    }
  }
}
// The library supports executable clipboard imports and JSON hotkeys; this editor accepts only mapped business fields.
function preventUnsupportedImport(event: ClipboardEvent | KeyboardEvent) {
  if (!props.modelValue || !editable.value) return;
  const blocked =
    event instanceof ClipboardEvent
      ? event.clipboardData?.getData('text/plain').startsWith('FormCreate:')
      : event.target === document.body &&
        (event.ctrlKey || event.metaKey) &&
        ['3', '4', 'c', 'v', 'x'].includes(event.key.toLowerCase());
  if (blocked) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
document.addEventListener('paste', preventUnsupportedImport, true);
document.addEventListener('keydown', preventUnsupportedImport, true);
watch(editable, (value, old) => {
  if (!value && old && props.modelValue) modalApi.close();
});
onBeforeUnmount(() => {
  serial++;
  document.removeEventListener('paste', preventUnsupportedImport, true);
  document.removeEventListener('keydown', preventUnsupportedImport, true);
});
</script>
<template>
  <Modal>
    <el-alert
      v-if="failureText"
      :title="failureText"
      type="error"
      :closable="false"
      class="mb-3"
    >
      <el-button v-if="formId && can('query')" :disabled="busy" @click="reload">
        重新读取
      </el-button>
    </el-alert>
    <MetadataForm />
    <component
      :is="designerComponent"
      v-if="editable && designerComponent"
      ref="designer"
      class="lowcode-designer"
      :menu="menu"
      :config="config"
      height="min(650px,65vh)"
      :inert="busy || !loaded"
    />
    <RuntimeFields
      v-else-if="!editable"
      :model-value="initialData(draft.schema)"
      :schema="draft.schema"
      disabled
    />
    <template #footer>
      <el-button :disabled="busy" @click="modalApi.close()">关闭</el-button>
      <el-button :disabled="busy || !loaded" @click="openPreview">
        填写预览
      </el-button>
      <el-button
        v-if="editable"
        type="primary"
        :disabled="!loaded"
        :loading="busy"
        @click="save"
      >
        保存草稿
      </el-button>
      <el-button
        v-if="editable && can('publish')"
        type="success"
        :disabled="!loaded || busy"
        @click="publish"
      >
        保存并发布
      </el-button>
    </template>
  </Modal>
  <PreviewModal>
    <RuntimeFields v-model="previewData" :schema="draft.schema" />
  </PreviewModal>
</template>
<style scoped>
/* form-create designer 3.5.0 FcDesigner.vue has no config switches for these two actions.
   This schema has no hidden-field semantics; native tree copy generates incompatible keys.
   Keep native canvas drag/delete and the rest of the property panel unchanged. */
.lowcode-designer
  :deep([class~='_fc-r-tab-props'] > [class~='_fd-config-item']),
.lowcode-designer :deep([class~='_fc-tree-more']) {
  display: none;
}
</style>
