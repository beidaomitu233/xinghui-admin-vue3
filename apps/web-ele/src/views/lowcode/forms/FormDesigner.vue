<script setup lang="ts">
import type { Sortable } from '@vben/hooks';

import type {
  FieldType,
  FieldValue,
  FormDefinition,
  FormDraft,
  FormField,
} from '#/api/lowcode/forms';

import { computed, nextTick, onBeforeUnmount, ref, toRaw, watch } from 'vue';

import { useSortable } from '@vben/hooks';
import { IconifyIcon } from '@vben/icons';
import { useAccessStore } from '@vben/stores';

import { ElMessage, ElMessageBox } from 'element-plus';

import {
  createForm,
  getForm,
  publishForm,
  updateForm,
} from '#/api/lowcode/forms';

import {
  dataError,
  fieldTypes,
  initialData,
  newField,
  schemaError,
} from '../form-schema';
import RuntimeFields from '../RuntimeFields.vue';

const props = defineProps<{
  modelValue: boolean;
  readOnly?: boolean;
  source?: FormDefinition;
}>();
const emit = defineEmits<{
  saved: [];
  'update:modelValue': [value: boolean];
}>();
const access = useAccessStore();
const can = (action: string) =>
  access.accessCodes.includes(`lowcode:form:${action}`);
const opened = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
});
const draft = ref<FormDraft>({
  name: '',
  formKey: '',
  status: 'draft',
  revision: 0,
  schema: { fields: [newField(1)] },
});
const formId = ref<string>();
const selected = ref(0);
const field = computed(() => draft.value.schema.fields[selected.value]);
const busy = ref(false);
const failed = ref(false);
const failureText = ref('');
const preview = ref(false);
const previewData = ref<Record<string, FieldValue>>({});
const defaultData = computed({
  get: () =>
    field.value ? { [field.value.fieldKey]: field.value.defaultValue } : {},
  set: (value: Record<string, FieldValue>) => {
    if (field.value)
      field.value.defaultValue = value[field.value.fieldKey] ?? null;
  },
});
watch(
  () => props.modelValue,
  (value) => {
    if (!value) return;
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
    selected.value = 0;
    failed.value = false;
  },
);
const paletteElement = ref<HTMLElement>();
const canvasElement = ref<HTMLElement>();
const identities = new WeakMap<object, string>();
let nextIdentity = 0;
const paletteIcons: Record<FieldType, string> = {
  text: 'lucide:type',
  textarea: 'lucide:align-left',
  number: 'lucide:hash',
  date: 'lucide:calendar',
  select: 'lucide:list-checks',
  multiselect: 'lucide:list-todo',
  switch: 'lucide:toggle-left',
};
function fieldIdentity(item: FormField) {
  const raw = toRaw(item);
  const existing = identities.get(raw);
  if (existing) return existing;
  const key = `designer-${++nextIdentity}`;
  identities.set(raw, key);
  return key;
}
function addField(
  type: FieldType = 'text',
  position = draft.value.schema.fields.length,
) {
  if (busy.value || props.readOnly || draft.value.schema.fields.length >= 100)
    return;
  position = Math.max(0, Math.min(position, draft.value.schema.fields.length));
  let index = 1;
  while (
    draft.value.schema.fields.some((item) => item.fieldKey === `field_${index}`)
  )
    index++;
  const item = newField(index);
  item.type = type;
  item.label =
    fieldTypes.find((entry) => entry.value === type)?.label ?? '字段';
  changeType(item);
  draft.value.schema.fields.splice(position, 0, item);
  selected.value = position;
}
function reorder(oldIndex: number, newIndex: number) {
  const fields = draft.value.schema.fields;
  const active = fields[selected.value];
  const item = fields.splice(oldIndex, 1)[0];
  if (item) fields.splice(newIndex, 0, item);
  selected.value = active ? Math.max(0, fields.indexOf(active)) : 0;
}
let dragRun = 0;
let paletteSortable: Sortable | undefined;
let canvasSortable: Sortable | undefined;
function destroyDrag() {
  paletteSortable?.destroy();
  canvasSortable?.destroy();
  paletteSortable = undefined;
  canvasSortable = undefined;
}
watch(
  [paletteElement, canvasElement, () => props.modelValue, () => props.readOnly],
  async () => {
    const run = ++dragRun;
    destroyDrag();
    await nextTick();
    const paletteNode = paletteElement.value;
    const canvasNode = canvasElement.value;
    if (!props.modelValue || props.readOnly || !paletteNode || !canvasNode)
      return;
    const palette = await useSortable(paletteNode, {
      group: { name: 'lowcode-fields', pull: 'clone', put: false },
      sort: false,
      draggable: '.palette-field',
      animation: 150,
      disabled: busy.value,
    }).initializeSortable();
    const canvas = await useSortable(canvasNode, {
      group: { name: 'lowcode-fields', pull: true, put: true },
      draggable: '.designer-field',
      handle: '.field-drag',
      animation: 150,
      disabled: busy.value,
      onAdd(event) {
        const type = event.item.dataset.type as FieldType;
        const position = event.newIndex ?? draft.value.schema.fields.length;
        // Keep Vue's original palette node/listeners; Sortable's source clone has no Vue listeners.
        if (event.clone?.parentNode === event.from)
          event.clone.replaceWith(event.item);
        else {
          event.item.remove();
          event.from.insertBefore(
            event.item,
            event.from.children[event.oldIndex ?? 0] ?? null,
          );
        }
        if (fieldTypes.some((entry) => entry.value === type))
          addField(type, position);
      },
      onUpdate(event) {
        if (event.oldIndex === undefined || event.newIndex === undefined)
          return;
        // Restore DOM first; Vue then applies the canonical model reorder using stable keys.
        event.item.remove();
        event.from.insertBefore(
          event.item,
          event.from.children[event.oldIndex] ?? null,
        );
        reorder(event.oldIndex, event.newIndex);
      },
    }).initializeSortable();
    if (run !== dragRun) {
      palette?.destroy();
      canvas?.destroy();
      return;
    }
    paletteSortable = palette;
    canvasSortable = canvas;
  },
  { flush: 'post' },
);
watch(busy, (value) => {
  paletteSortable?.option('disabled', value);
  canvasSortable?.option('disabled', value);
});
onBeforeUnmount(() => {
  dragRun++;
  destroyDrag();
});
function removeField(index: number) {
  draft.value.schema.fields.splice(index, 1);
  selected.value = Math.max(
    0,
    Math.min(selected.value, draft.value.schema.fields.length - 1),
  );
}
function move(index: number, offset: number) {
  const fields = draft.value.schema.fields;
  const next = index + offset;
  if (next < 0 || next >= fields.length) return;
  const item = fields.splice(index, 1)[0];
  if (item) fields.splice(next, 0, item);
  selected.value = next;
}
function changeType(current: FormField) {
  current.defaultValue = null;
  current.options = ['multiselect', 'select'].includes(current.type)
    ? [{ label: '选项1', value: 'option_1' }]
    : [];
  current.maxLength = current.type === 'textarea' ? 5000 : 200;
  if (current.type === 'multiselect') current.searchable = false;
}
function addOption(current: FormField) {
  let index = 1;
  while (current.options.some((option) => option.value === `option_${index}`))
    index++;
  current.options.push({ label: `选项${index}`, value: `option_${index}` });
}
function openPreview() {
  const error = schemaError(draft.value.schema);
  if (error) {
    ElMessage.warning(error);
    return;
  }
  previewData.value = initialData(draft.value.schema);
  preview.value = true;
}
function validatePreview() {
  const error = dataError(draft.value.schema, previewData.value);
  if (error) ElMessage.warning(error);
  else ElMessage.success('填写有效，预览不会保存数据');
}
async function save(): Promise<boolean> {
  const error = schemaError(draft.value.schema);
  if (
    error ||
    !draft.value.name.trim() ||
    draft.value.name.trim().length > 100 ||
    (!formId.value && !/^[a-z][a-z0-9_]{0,49}$/u.test(draft.value.formKey))
  ) {
    ElMessage.warning(error || '名称或表单标识不正确');
    return false;
  }
  busy.value = true;
  failed.value = false;
  try {
    if (formId.value) {
      const saved = await updateForm(formId.value, draft.value);
      draft.value.revision = saved.revision;
      draft.value.status = saved.status;
    } else {
      formId.value = await createForm(draft.value);
    }
    emit('saved');
    ElMessage.success('草稿已保存');
    return true;
  } catch {
    failed.value = true;
    failureText.value = '保存未成功，草稿已保留。版本冲突时请重新读取。';
    return false;
  } finally {
    busy.value = false;
  }
}
async function publish() {
  try {
    await ElMessageBox.confirm(
      '发布后填写页将使用这个版本，是否继续？',
      '发布确认',
    );
  } catch {
    return;
  }
  if (!(await save()) || !formId.value) return;
  busy.value = true;
  failed.value = false;
  try {
    const saved = await publishForm(formId.value, draft.value.revision);
    draft.value.revision = saved.revision;
    draft.value.status = saved.status;
    emit('saved');
    ElMessage.success('表单已发布');
  } catch {
    failed.value = true;
    failureText.value =
      '发布未成功，已保存草稿仍保留。请检查版本冲突或已有记录的字段兼容性。';
  } finally {
    busy.value = false;
  }
}
async function reload() {
  if (!formId.value) return;
  try {
    await ElMessageBox.confirm(
      '重新读取将替换未保存的草稿，是否继续？',
      '重新读取确认',
    );
  } catch {
    return;
  }
  busy.value = true;
  try {
    const fresh = await getForm(formId.value);
    draft.value = {
      name: fresh.name,
      formKey: fresh.formKey,
      status: fresh.status,
      revision: fresh.revision,
      schema: fresh.schema,
    };
    selected.value = 0;
    failed.value = false;
  } catch {
    failed.value = true;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <!-- Prettier formats adjacent inline controls; avoid conflicting whitespace rules. -->
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/html-closing-bracket-newline -->
  <el-dialog
    v-model="opened"
    :title="readOnly ? '表单详情' : '表单设计'"
    width="min(1480px,96vw)"
    :close-on-click-modal="false"
    :show-close="!busy"
    :close-on-press-escape="!busy"
  >
    <el-alert
      v-if="failed"
      :title="failureText"
      type="error"
      class="mb-3"
      closable
    >
      <el-button v-if="formId && can('query')" :disabled="busy" @click="reload">
        重新读取
      </el-button>
    </el-alert>
    <el-form label-width="100px" :disabled="busy || readOnly" inline>
      <el-form-item label="表单名称" required>
        <el-input v-model="draft.name" maxlength="100" />
      </el-form-item>
      <el-form-item label="表单标识" required>
        <el-input
          v-model="draft.formKey"
          :disabled="Boolean(formId)"
          maxlength="50"
          placeholder="小写字母、数字、下划线"
        />
      </el-form-item>
    </el-form>
    <div class="form-designer-layout">
      <section class="designer-palette" aria-label="字段组件">
        <h3>字段组件</h3>
        <p>拖到画布，或点击添加</p>
        <div ref="paletteElement" class="palette-items">
          <button
            v-for="type in fieldTypes"
            :key="type.value"
            type="button"
            class="palette-field"
            :data-type="type.value"
            :disabled="busy || readOnly"
            @click="addField(type.value)"
          >
            <IconifyIcon :icon="paletteIcons[type.value]" class="size-4" />
            {{ type.label }}
          </button>
        </div>
      </section>
      <section class="designer-canvas-section" aria-label="表单画布">
        <div class="canvas-heading">
          <h3>{{ draft.name || '表单画布' }}</h3>
          <span>{{ draft.schema.fields.length }} 个字段</span>
        </div>
        <div ref="canvasElement" class="designer-canvas">
          <article
            v-for="(item, index) in draft.schema.fields"
            :key="fieldIdentity(item)"
            class="designer-field"
            :class="{ 'is-selected': selected === index }"
            :data-field-id="fieldIdentity(item)"
            :aria-label="`选择字段 ${item.label}`"
            tabindex="0"
            @click="selected = index"
            @keydown.enter="selected = index"
          >
            <div class="field-toolbar">
              <button
                type="button"
                class="field-drag"
                :aria-label="`拖拽 ${item.label}`"
                :disabled="busy || readOnly"
              >
                <IconifyIcon icon="lucide:grip-vertical" class="size-4" />
              </button>
              <span>{{ item.fieldKey }}</span>
              <el-button
                text
                size="small"
                :disabled="busy || readOnly || index === 0"
                @click.stop="move(index, -1)"
              >
                上移
              </el-button>
              <el-button
                text
                size="small"
                :disabled="
                  busy || readOnly || index === draft.schema.fields.length - 1
                "
                @click.stop="move(index, 1)"
              >
                下移
              </el-button>
              <el-button
                text
                size="small"
                type="danger"
                :disabled="busy || readOnly"
                @click.stop="removeField(index)"
              >
                移除
              </el-button>
            </div>
            <div class="field-rendering">
              <RuntimeFields
                :model-value="initialData({ fields: [item] })"
                :schema="{ fields: [item] }"
                disabled
              />
            </div>
          </article>
          <p v-if="draft.schema.fields.length === 0" class="canvas-empty">
            将字段拖到这里，开始设计表单
          </p>
        </div>
      </section>
      <el-card class="field-properties">
        <template #header>字段设置</template>
        <el-form v-if="field" label-width="110px" :disabled="busy || readOnly">
          <el-form-item label="字段标识" required>
            <el-input
              v-model="field.fieldKey"
              maxlength="50"
              placeholder="如 contact_name"
            />
          </el-form-item>
          <el-form-item label="显示名称" required>
            <el-input v-model="field.label" maxlength="100" />
          </el-form-item>
          <el-form-item label="字段类型">
            <el-select v-model="field.type" @change="changeType(field)">
              <el-option
                v-for="type in fieldTypes"
                :key="type.value"
                :label="type.label"
                :value="type.value"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="必填">
            <el-switch v-model="field.required" />
          </el-form-item>
          <el-form-item label="字段帮助">
            <el-input v-model="field.help" maxlength="500" />
          </el-form-item>
          <el-form-item
            v-if="field.type === 'text' || field.type === 'textarea'"
            label="最大长度"
          >
            <el-input-number
              v-model="field.maxLength"
              :min="1"
              :max="field.type === 'textarea' ? 5000 : 2000"
              :precision="0"
            />
          </el-form-item>
          <template v-if="field.type === 'number'">
            <el-form-item label="最小值">
              <el-input-number v-model="field.min" :min="-1e12" :max="1e12" />
            </el-form-item>
            <el-form-item label="最大值">
              <el-input-number v-model="field.max" :min="-1e12" :max="1e12" />
            </el-form-item>
          </template>
          <el-form-item
            v-if="field.type === 'select' || field.type === 'multiselect'"
            label="选项"
          >
            <div class="w-full">
              <div
                v-for="(option, index) in field.options"
                :key="index"
                class="mb-2 flex gap-2"
              >
                <el-input
                  v-model="option.label"
                  placeholder="选项名称"
                  maxlength="100"
                />
                <el-input
                  v-model="option.value"
                  placeholder="选项值"
                  maxlength="100"
                />
                <el-button @click="field.options.splice(index, 1)">
                  移除
                </el-button>
              </div>
              <el-button
                :disabled="field.options.length >= 100"
                @click="addOption(field)"
              >
                添加选项
              </el-button>
            </div>
          </el-form-item>
          <el-form-item label="列表显示">
            <el-switch v-model="field.listVisible" />
          </el-form-item>
          <el-form-item label="允许查询">
            <el-switch
              v-model="field.searchable"
              :disabled="field.type === 'multiselect'"
            />
          </el-form-item>
          <el-form-item label="默认值">
            <div class="w-full">
              <RuntimeFields
                v-model="defaultData"
                :schema="{
                  fields: [
                    {
                      ...field,
                      label: '默认填写值',
                      required: false,
                      help: '',
                    },
                  ],
                }"
                :disabled="busy || readOnly"
              />
              <el-button @click="field.defaultValue = null">
                清空默认值
              </el-button>
            </div>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
    <template #footer>
      <el-button :disabled="busy" @click="openPreview">预览填写</el-button>
      <el-button :disabled="busy" @click="opened = false">关闭</el-button>
      <el-button
        v-if="!readOnly && (formId ? can('edit') : can('add'))"
        :loading="busy"
        @click="save"
      >
        保存草稿
      </el-button>
      <el-button
        v-if="
          !readOnly && can('publish') && (formId ? can('edit') : can('add'))
        "
        type="primary"
        :loading="busy"
        @click="publish"
      >
        保存并发布
      </el-button>
    </template>
  </el-dialog>
  <el-dialog v-model="preview" title="填写预览" width="min(760px,92vw)">
    <RuntimeFields v-model="previewData" :schema="draft.schema" />
    <template #footer>
      <el-button @click="validatePreview">验证填写</el-button>
      <el-button @click="preview = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-designer-layout {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr) 310px;
  gap: 16px;
  align-items: start;
  max-height: calc(100dvh - 260px);
  overflow: auto;
}

.designer-palette {
  padding: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.designer-palette h3,
.canvas-heading h3 {
  margin: 0;
  font-weight: 600;
}

.designer-palette p,
.canvas-heading span {
  margin: 8px 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.palette-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.palette-field {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px;
  color: hsl(var(--foreground));
  cursor: grab;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.palette-field:disabled {
  cursor: default;
  opacity: 0.5;
}

.designer-canvas-section {
  min-width: 0;
  padding: 16px;
  background: hsl(var(--muted) / 40%);
  border-radius: 8px;
}

.canvas-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.designer-canvas {
  min-height: 300px;
  padding-top: 12px;
}

.designer-field {
  padding: 12px;
  margin-bottom: 12px;
  outline-offset: 2px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.designer-field.is-selected {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 1px hsl(var(--primary));
}

.field-toolbar {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-bottom: 8px;
}

.field-toolbar > span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.field-toolbar :deep(.el-button + .el-button) {
  margin-left: 0;
}

.field-drag {
  padding: 4px;
  cursor: grab;
}

.field-rendering {
  pointer-events: none;
}

.field-rendering :deep(.el-form-item) {
  margin-bottom: 8px;
}

.canvas-empty {
  padding: 64px 12px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.field-properties {
  min-width: 0;
}

@media (max-width: 1100px) {
  .form-designer-layout {
    grid-template-columns: minmax(0, 1fr) 300px;
  }

  .designer-palette {
    grid-column: 1 / -1;
  }

  .palette-items {
    flex-flow: row wrap;
  }
}

@media (max-width: 700px) {
  .form-designer-layout {
    grid-template-columns: minmax(0, 1fr);
    max-height: calc(100dvh - 300px);
  }

  .designer-palette {
    grid-column: auto;
  }

  .designer-canvas-section {
    padding: 10px;
  }
}
</style>
