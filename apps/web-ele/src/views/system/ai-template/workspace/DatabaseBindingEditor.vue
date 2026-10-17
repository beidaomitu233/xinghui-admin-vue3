<script setup lang="ts">
import type { Ref } from 'vue';

import type {
  BindingMode,
  BindingPreview,
  DatabaseField,
  DatabaseRecord,
  DatabaseRelation,
  DatabaseTable,
  DataBinding,
  DataFilter,
  FilterOperator,
} from '#/api/system/ai-database';
import type { SceneSubmission } from '#/api/system/ai-scene';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import { useAccessStore } from '@vben/stores';

import {
  ElAlert,
  ElButton,
  ElCollapse,
  ElCollapseItem,
  ElDrawer,
  ElEmpty,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElOption,
  ElPopconfirm,
  ElRadioButton,
  ElRadioGroup,
  ElSelect,
  ElTag,
} from 'element-plus';

import {
  databaseFields,
  databaseRelations,
  databaseTables,
  previewBindings,
} from '#/api/system/ai-database';

import { bindingFilters, bindingVariable } from './binding-input';
import { databaseFilterValue } from './database-filter-value';
import DatabaseRecordPicker from './DatabaseRecordPicker.vue';
import { cloneDataBinding } from './scene-save-adapter';
import SceneFormPicker from './SceneFormPicker.vue';

const props = defineProps<{
  preparePreview?: () => Promise<DataBinding[]>;
  previewDisabled?: boolean;
  readonly: boolean;
  readPreview?: (
    businessRef: SceneSubmission['businessRef'],
  ) => Promise<BindingPreview>;
  value: DataBinding[];
}>();
const emit = defineEmits<{
  change: [value: DataBinding[]];
  context: [value: SceneSubmission['businessRef']];
  insert: [variable: string];
}>();
const tables = ref<DatabaseTable[]>([]);
const access = useAccessStore();
const canDatabase = computed(() =>
  access.accessCodes.includes('ai:data:database:read'),
);
const sourceKind = ref<'database' | 'lowcode'>(
  canDatabase.value ? 'database' : 'lowcode',
);
const fields = ref<DatabaseField[]>([]);
const relations = ref<DatabaseRelation[]>([]);
const parentFields = ref<DatabaseField[]>([]);
const keyword = ref('');
const page = ref(1);
const total = ref('0');
const editing = ref<null | number>(null);
const expanded = ref(false);
const sourceKey = ref('');
const mode = ref<BindingMode>('FIELD');
const label = ref('');
const selectedFields = ref<string[]>([]);
const filters: Ref<DataFilter[]> = ref([]);
const limit = ref(20);
const currentRecord = ref(false);
const record = ref<DatabaseRecord | null>(null);
const previewRecord = ref<DatabaseRecord | null>(null);
const parentVariable = ref('');
const parentField = ref('');
const childField = ref('');
const preview = ref<BindingPreview>();
const error = ref('');
const loading = ref(false);
const previewing = ref(false);
const filterPanels = ref<string[]>([]);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
const table = computed(() =>
  tables.value.find((item) => item.sourceKey === sourceKey.value),
);
const parents = computed(() =>
  props.value.filter(
    (binding, index) =>
      binding.mode === 'ROW' &&
      (editing.value === null || index < editing.value),
  ),
);
const currentSource = computed(
  () =>
    props.value.find((binding) => binding.row?.currentRecord)?.sourceKey ?? '',
);
const availableRelations = computed(() =>
  relations.value.filter(
    (relation) =>
      relation.childSourceKey === sourceKey.value &&
      props.value.some(
        (binding) =>
          binding.variable === parentVariable.value &&
          binding.sourceKey === relation.parentSourceKey,
      ),
  ),
);
const modeLabels: Record<BindingMode, string> = {
  CHILDREN: '关联子表',
  FIELD: '单条记录的字段',
  ROW: '整条记录',
  TABLE: '整表数据',
};
const operators: { label: string; value: FilterOperator }[] = [
  { value: 'EQ', label: '等于' },
  { value: 'NE', label: '不等于' },
  { value: 'GT', label: '大于' },
  { value: 'GE', label: '大于或等于' },
  { value: 'LT', label: '小于' },
  { value: 'LE', label: '小于或等于' },
  { value: 'CONTAINS', label: '包含文本' },
  { value: 'IS_NULL', label: '为空' },
  { value: 'NOT_NULL', label: '不为空' },
];
let alive = true;
let listGeneration = 0;
let sourceGeneration = 0;
let parentGeneration = 0;
let previewGeneration = 0;
async function loadTables() {
  if (!canDatabase.value) return;
  const run = ++listGeneration;
  loading.value = true;
  try {
    const result = await databaseTables({
      keyword: keyword.value,
      pageNum: page.value,
      pageSize: 20,
    });
    if (alive && run === listGeneration) {
      tables.value = result.records;
      total.value = result.total;
    }
  } catch {
    if (alive && run === listGeneration)
      error.value = '表目录读取失败或当前无取数权限，请重试。';
  } finally {
    if (alive && run === listGeneration) loading.value = false;
  }
}
async function loadSource(key: string) {
  const run = ++sourceGeneration;
  fields.value = [];
  relations.value = [];
  record.value = null;
  if (!key) return;
  try {
    const [metadata, links] = await Promise.all([
      databaseFields(key),
      key.startsWith('lowcode.') ? Promise.resolve([]) : databaseRelations(key),
    ]);
    if (!alive || run !== sourceGeneration) return;
    fields.value = metadata.fields;
    relations.value = links;
  } catch {
    if (alive && run === sourceGeneration)
      error.value = '字段或关系目录读取失败，请重试。';
  }
}
watch(sourceKey, loadSource);
watch(parentVariable, async (variable) => {
  const run = ++parentGeneration;
  parentFields.value = [];
  const parent = props.value.find(
    (binding) => binding.variable === variable && binding.mode === 'ROW',
  );
  if (!parent) return;
  try {
    const result = await databaseFields(parent.sourceKey);
    if (alive && run === parentGeneration) parentFields.value = result.fields;
  } catch {
    if (alive && run === parentGeneration) error.value = '主记录字段读取失败。';
  }
});
watch(
  () => props.value,
  () => {
    previewGeneration++;
    preview.value = undefined;
  },
  { deep: true },
);
watch(previewRecord, (value) => emit('context', value?.businessRef ?? null));
function begin(index: null | number = null) {
  if (props.readonly) return;
  error.value = '';
  previewGeneration++;
  preview.value = undefined;
  editing.value = index;
  expanded.value = true;
  const binding = index === null ? undefined : props.value[index];
  sourceKind.value = canDatabase.value ? 'database' : 'lowcode';
  if (binding?.sourceKey.startsWith('lowcode.')) sourceKind.value = 'lowcode';
  sourceKey.value = binding?.sourceKey ?? '';
  mode.value = binding?.mode ?? 'FIELD';
  label.value = binding?.label ?? '';
  selectedFields.value = [...(binding?.fields ?? [])];
  filters.value = binding
    ? bindingFilters(binding.mode, cloneDataBinding(binding).filters)
    : [];
  filterPanels.value = [];
  limit.value = binding?.limit ?? 20;
  currentRecord.value = binding?.row?.currentRecord ?? false;
  record.value = null;
  parentVariable.value = binding?.relation?.parentVariable ?? '';
  parentField.value = binding?.relation?.parentField ?? '';
  childField.value = binding?.relation?.childField ?? '';
}
function changeSource() {
  selectedFields.value = [];
  filters.value = [];
  label.value = '';
  record.value = null;
  parentField.value = '';
  childField.value = '';
}
function chooseField(value: string) {
  selectedFields.value = value ? [value] : [];
}
function searchTables(value: string) {
  keyword.value = value;
  page.value = 1;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadTables(), 250);
}
function variableName(text: string) {
  return bindingVariable(
    text,
    props.value
      .filter((_, index) => index !== editing.value)
      .map((binding) => binding.variable),
  );
}
function changeMode() {
  selectedFields.value = [];
  filters.value = bindingFilters(mode.value, filters.value);
  filterPanels.value = [];
}
function add() {
  if (props.readonly || !sourceKey.value || fields.value.length === 0) return;
  if (props.value.length >= 16 && editing.value === null) {
    error.value = '最多添加 16 个引用。';
    return;
  }
  if (mode.value === 'FIELD' && selectedFields.value.length !== 1) {
    error.value = '请选择一个字段。';
    return;
  }
  const saved = editing.value === null ? undefined : props.value[editing.value];
  const previous = saved?.sourceKey === sourceKey.value ? saved : undefined;
  const previousKey =
    previous?.row &&
    !previous.row.currentRecord &&
    Object.keys(previous.row.key).length > 0
      ? previous.row.key
      : undefined;
  if (
    ['FIELD', 'ROW'].includes(mode.value) &&
    !currentRecord.value &&
    !record.value &&
    !previousKey
  ) {
    error.value = '请按名称选择一条记录。';
    return;
  }
  if (
    mode.value === 'CHILDREN' &&
    (!parentVariable.value || !parentField.value || !childField.value)
  ) {
    error.value = '请选择主记录与实际关联字段。';
    return;
  }
  if (
    !Number.isSafeInteger(limit.value) ||
    limit.value < 1 ||
    limit.value > 200
  ) {
    error.value = '数量上限为 1 到 200 行。';
    return;
  }
  const text =
    label.value.trim() ||
    (mode.value === 'FIELD'
      ? `${table.value?.label || '记录'}.${fields.value.find((field) => field.field === selectedFields.value[0])?.label || selectedFields.value[0]}`
      : table.value?.label || '数据引用');
  const binding: DataBinding = {
    variable: saved?.variable ?? variableName(text),
    label: text,
    sourceKey: sourceKey.value,
    mode: mode.value,
    fields: [...selectedFields.value],
    filters: bindingFilters(mode.value, filters.value),
    limit: ['FIELD', 'ROW'].includes(mode.value) ? 1 : limit.value,
    row: ['FIELD', 'ROW'].includes(mode.value)
      ? {
          currentRecord: currentRecord.value,
          key: currentRecord.value
            ? {}
            : (record.value?.key ?? previousKey ?? {}),
        }
      : null,
    relation:
      mode.value === 'CHILDREN'
        ? {
            parentVariable: parentVariable.value,
            parentField: parentField.value,
            childField: childField.value,
          }
        : null,
  };
  const values = props.value.map((binding) => cloneDataBinding(binding));
  if (editing.value === null) values.push(binding);
  else values[editing.value] = binding;
  emit('change', values);
  emit('insert', binding.variable);
  expanded.value = false;
}
function remove(index: number) {
  if (props.readonly) return;
  const binding = props.value[index];
  if (
    props.value.some(
      (item) => item.relation?.parentVariable === binding?.variable,
    )
  ) {
    error.value = '请先移除依赖该主记录的子表引用。';
    return;
  }
  emit(
    'change',
    props.value
      .filter((_, position) => position !== index)
      .map((binding) => cloneDataBinding(binding)),
  );
}
function setFilterValue(index: number, text: string) {
  const filter = filters.value[index];
  if (!filter) return;
  const field = fields.value.find((item) => item.field === filter.field);
  const value = databaseFilterValue(field?.type ?? '', text);
  filter.value = value;
}
function useRelation(value: string) {
  if (!value) return;
  const relation = availableRelations.value[Number(value)];
  if (relation) {
    parentField.value = relation.parentField;
    childField.value = relation.childField;
  }
}
async function previewData() {
  if (previewing.value || props.previewDisabled || props.value.length === 0)
    return;
  if (currentSource.value && !previewRecord.value) {
    error.value = '请为当前记录引用选择一条预览记录。';
    return;
  }
  let run = ++previewGeneration;
  previewing.value = true;
  error.value = '';
  expanded.value = false;
  try {
    const bindings = props.preparePreview
      ? await props.preparePreview()
      : props.value.map((binding) => cloneDataBinding(binding));
    await nextTick();
    if (!alive) return;
    run = ++previewGeneration;
    const result = props.readPreview
      ? await props.readPreview(previewRecord.value?.businessRef ?? null)
      : await previewBindings({
          bindings,
          businessRef: previewRecord.value?.businessRef ?? null,
        });
    if (alive && run === previewGeneration) preview.value = result;
  } catch {
    if (alive && run === previewGeneration)
      error.value = '数据预览未完成，请检查引用定义和当前取数权限。';
  } finally {
    if (alive) previewing.value = false;
  }
}
onMounted(loadTables);
onBeforeUnmount(() => {
  alive = false;
  listGeneration++;
  sourceGeneration++;
  parentGeneration++;
  previewGeneration++;
  clearTimeout(searchTimer);
});
</script>
<template>
  <section class="database-binding-editor" aria-label="数据库引用">
    <header class="reference-heading">
      <h2>数据引用</h2>
      <ElButton v-if="!readonly" type="primary" size="small" @click="begin()">
        添加引用
      </ElButton>
    </header>
    <ElEmpty
      v-if="value.length === 0"
      description="尚未添加数据引用"
      :image-size="56"
    >
      <p class="reference-hint">选择表和字段，将业务数据插入提示词。</p>
    </ElEmpty>
    <ul v-else class="reference-list">
      <li
        v-for="(binding, index) in value"
        :key="binding.variable"
        class="reference-row"
      >
        <div class="reference-summary">
          <ElButton
            text
            type="primary"
            class="reference-name"
            :disabled="readonly"
            @click="emit('insert', binding.variable)"
          >
            {{ binding.label }}
          </ElButton>
          <p class="reference-hint">
            {{ modeLabels[binding.mode] }} ·
            {{
              binding.fields.length > 0
                ? `${binding.fields.length} 个字段`
                : '全部已选可读字段'
            }}{{
              ['TABLE', 'CHILDREN'].includes(binding.mode)
                ? ` · 最多 ${binding.limit} 行`
                : ''
            }}
          </p>
        </div>
        <div class="reference-actions">
          <ElButton v-if="!readonly" link @click="begin(index)">编辑</ElButton>
          <ElPopconfirm
            v-if="!readonly"
            title="移除此引用？提示词中已插入的引用需一并检查。"
            confirm-button-text="移除"
            cancel-button-text="保留"
            @confirm="remove(index)"
          >
            <template #reference>
              <ElButton link type="danger">移除</ElButton>
            </template>
          </ElPopconfirm>
        </div>
      </li>
    </ul>
    <div v-if="value.length > 0" class="reference-preview-actions">
      <DatabaseRecordPicker
        v-if="currentSource"
        v-model="previewRecord"
        :source-key="currentSource"
        :readonly="previewing"
        label="选择预览与试运行记录"
      />
      <ElButton
        :loading="previewing"
        :disabled="previewDisabled"
        @click="previewData"
      >
        预览实际数据
      </ElButton>
      <p v-if="previewDisabled" class="reference-hint">
        预览需场景试运行与调用权限。
      </p>
    </div>
    <ElAlert
      v-if="error && !expanded && !preview"
      :title="error"
      type="error"
      closable
      @close="error = ''"
    />
    <ElDrawer
      v-model="expanded"
      :title="editing === null ? '添加数据引用' : '编辑数据引用'"
      size="min(720px, 100vw)"
      :close-on-click-modal="false"
    >
      <ElForm label-position="top" :disabled="readonly" class="reference-form">
        <ElFormItem label="数据来源">
          <ElRadioGroup
            v-model="sourceKind"
            aria-label="数据来源"
            @change="
              sourceKey = '';
              changeSource();
            "
          >
            <ElRadioButton v-if="canDatabase" value="database">
              数据库表
            </ElRadioButton>
            <ElRadioButton value="lowcode">低代码表单</ElRadioButton>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem v-if="sourceKind === 'database'" label="业务表" required>
          <ElSelect
            v-model="sourceKey"
            aria-label="业务表"
            filterable
            remote
            :remote-method="searchTables"
            :loading="loading"
            placeholder="按表名或备注搜索"
            @change="changeSource"
          >
            <ElOption
              v-if="
                sourceKey &&
                !tables.some((table) => table.sourceKey === sourceKey)
              "
              :value="sourceKey"
              :label="`已保存数据表 · ${sourceKey.slice(3)}`"
            />
            <ElOption
              v-for="catalogTable in tables"
              :key="catalogTable.sourceKey"
              :value="catalogTable.sourceKey"
              :label="`${catalogTable.label || catalogTable.comment || catalogTable.tableName}（${catalogTable.tableName}）`"
            />
            <template #footer>
              <div class="reference-pages">
                <ElButton
                  link
                  :disabled="page <= 1 || loading"
                  @click="
                    page--;
                    loadTables();
                  "
                >
                  上一页
                </ElButton>
                <span>第 {{ page }} 页</span>
                <ElButton
                  link
                  :disabled="BigInt(page * 20) >= BigInt(total) || loading"
                  @click="
                    page++;
                    loadTables();
                  "
                >
                  下一页
                </ElButton>
              </div>
            </template>
          </ElSelect>
        </ElFormItem>
        <ElFormItem v-else label="业务表单" required>
          <SceneFormPicker
            :disabled="readonly"
            :value="sourceKey.startsWith('lowcode.') ? sourceKey.slice(8) : ''"
            @change="
              sourceKey = `lowcode.${$event}`;
              changeSource();
            "
          />
        </ElFormItem>
        <ElFormItem label="取数方式">
          <ElRadioGroup
            v-model="mode"
            aria-label="取数方式"
            @change="changeMode"
          >
            <ElRadioButton value="FIELD">字段</ElRadioButton>
            <ElRadioButton value="ROW">记录</ElRadioButton>
            <ElRadioButton value="TABLE">整表</ElRadioButton>
            <ElRadioButton value="CHILDREN">关联子表</ElRadioButton>
          </ElRadioGroup>
        </ElFormItem>
        <ElFormItem
          :label="mode === 'FIELD' ? '引用字段' : '包含字段'"
          :required="mode === 'FIELD'"
        >
          <ElSelect
            :model-value="
              mode === 'FIELD' ? (selectedFields[0] ?? '') : selectedFields
            "
            aria-label="引用字段"
            filterable
            :multiple="mode !== 'FIELD'"
            collapse-tags
            collapse-tags-tooltip
            :disabled="!sourceKey"
            :placeholder="
              mode === 'FIELD'
                ? '搜索并选择一个字段'
                : '不选则固定本次全部可读字段'
            "
            @update:model-value="
              mode === 'FIELD' ? chooseField($event) : (selectedFields = $event)
            "
          >
            <ElOption
              v-for="field in fields"
              :key="field.field"
              :value="field.field"
              :label="`${field.label || field.field}（${field.field} · ${field.type}）`"
            />
          </ElSelect>
        </ElFormItem>
        <template v-if="['FIELD', 'ROW'].includes(mode)">
          <ElFormItem label="记录范围">
            <ElRadioGroup v-model="currentRecord" aria-label="记录范围">
              <ElRadioButton :value="false">固定记录</ElRadioButton>
              <ElRadioButton :value="true">当前业务记录</ElRadioButton>
            </ElRadioGroup>
          </ElFormItem>
          <ElFormItem
            v-if="sourceKey && !currentRecord"
            label="固定记录"
            required
          >
            <div class="fixed-record-picker">
              <p
                v-if="
                  editing !== null &&
                  !record &&
                  value[editing]?.sourceKey === sourceKey &&
                  value[editing]?.row &&
                  !value[editing]?.row?.currentRecord
                "
                class="reference-hint"
              >
                保留已保存记录，重新选择可替换。
              </p>
              <DatabaseRecordPicker
                v-model="record"
                :source-key="sourceKey"
                label="搜索并选择固定记录"
              />
            </div>
          </ElFormItem>
        </template>
        <template v-if="mode === 'CHILDREN'">
          <ElAlert
            v-if="parents.length === 0"
            title="先添加一条主记录引用，再关联其子表。"
            type="info"
            :closable="false"
          />
          <ElFormItem label="主记录引用" required>
            <ElSelect
              v-model="parentVariable"
              aria-label="主记录引用"
              filterable
              placeholder="选择前面添加的主记录"
            >
              <ElOption
                v-for="parent in parents"
                :key="parent.variable"
                :value="parent.variable"
                :label="parent.label"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem v-if="availableRelations.length > 0" label="已发现的关联">
            <ElSelect
              aria-label="数据库关联"
              placeholder="选择关联，或在下方指定实际字段"
              clearable
              @change="useRelation($event ?? '')"
            >
              <ElOption
                v-for="(relation, index) in availableRelations"
                :key="relation.name"
                :value="String(index)"
                :label="`${relation.parentField} → ${relation.childField}`"
              />
            </ElSelect>
          </ElFormItem>
          <div class="reference-two-fields">
            <ElFormItem label="主记录关联字段" required>
              <ElSelect
                v-model="parentField"
                aria-label="主记录关联字段"
                filterable
              >
                <ElOption
                  v-for="field in parentFields"
                  :key="field.field"
                  :value="field.field"
                  :label="field.label || field.field"
                />
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="子表对应字段" required>
              <ElSelect
                v-model="childField"
                aria-label="子表关联字段"
                filterable
              >
                <ElOption
                  v-for="field in fields"
                  :key="field.field"
                  :value="field.field"
                  :label="field.label || field.field"
                />
              </ElSelect>
            </ElFormItem>
          </div>
        </template>
        <ElCollapse
          v-if="sourceKey && ['TABLE', 'CHILDREN'].includes(mode)"
          v-model="filterPanels"
          class="reference-filters"
        >
          <ElCollapseItem
            name="filters"
            :title="`筛选条件${filters.length > 0 ? `（${filters.length}）` : '（可选）'}`"
          >
            <p class="reference-hint">以下条件需要全部满足。</p>
            <div
              v-for="(filter, index) in filters"
              :key="index"
              class="filter-row"
            >
              <ElSelect
                v-model="filter.field"
                aria-label="筛选字段"
                filterable
                @change="
                  filter.value = ['IS_NULL', 'NOT_NULL'].includes(
                    filter.operator,
                  )
                    ? null
                    : ''
                "
              >
                <ElOption
                  v-for="field in fields"
                  :key="field.field"
                  :value="field.field"
                  :label="field.label || field.field"
                />
              </ElSelect>
              <ElSelect
                v-model="filter.operator"
                aria-label="筛选比较方式"
                @change="
                  filter.value = ['IS_NULL', 'NOT_NULL'].includes(
                    filter.operator,
                  )
                    ? null
                    : ''
                "
              >
                <ElOption
                  v-for="operator in operators"
                  :key="operator.value"
                  :value="operator.value"
                  :label="operator.label"
                />
              </ElSelect>
              <ElSelect
                v-if="
                  /^(?:boolean|bool)\b/i.test(
                    fields.find((field) => field.field === filter.field)
                      ?.type ?? '',
                  ) && !['IS_NULL', 'NOT_NULL'].includes(filter.operator)
                "
                aria-label="布尔筛选值"
                :model-value="String(filter.value)"
                @update:model-value="setFilterValue(index, $event)"
              >
                <ElOption label="是" value="true" />
                <ElOption label="否" value="false" />
              </ElSelect>
              <ElInput
                v-else-if="!['IS_NULL', 'NOT_NULL'].includes(filter.operator)"
                aria-label="筛选值"
                :model-value="filter.value === null ? '' : String(filter.value)"
                @update:model-value="setFilterValue(index, $event)"
              />
              <ElButton link type="danger" @click="filters.splice(index, 1)">
                移除
              </ElButton>
            </div>
            <ElButton
              :disabled="filters.length >= 16 || !fields[0]"
              @click="
                filters.push({
                  field: fields[0]?.field ?? '',
                  operator: 'EQ',
                  value: '',
                })
              "
            >
              增加条件
            </ElButton>
          </ElCollapseItem>
        </ElCollapse>
        <div class="reference-two-fields">
          <ElFormItem label="引用名称">
            <ElInput
              v-model="label"
              aria-label="引用名称"
              maxlength="100"
              placeholder="留空按表与字段生成"
            />
          </ElFormItem>
          <ElFormItem
            v-if="['TABLE', 'CHILDREN'].includes(mode)"
            label="最多取数行数"
          >
            <ElInputNumber
              :model-value="limit"
              @update:model-value="limit = $event ?? 20"
              aria-label="最多取数行数"
              :min="1"
              :max="200"
              :precision="0"
              controls-position="right"
            />
          </ElFormItem>
        </div>
      </ElForm>
      <ElAlert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        closable
        @close="error = ''"
      />
      <template #footer>
        <ElButton @click="expanded = false">取消</ElButton>
        <ElButton
          type="primary"
          :disabled="readonly || !sourceKey || fields.length === 0"
          @click="add"
        >
          保存并插入提示词
        </ElButton>
      </template>
    </ElDrawer>
    <ElDrawer
      :model-value="Boolean(preview)"
      title="实际数据预览"
      size="min(780px, 100vw)"
      @close="preview = undefined"
    >
      <template v-if="preview">
        <p
          v-for="(notice, index) in preview.notices"
          :key="index"
          class="reference-hint"
        >
          {{
            notice.code === 'FIELD_NOT_IN_RECORD_SCHEMA'
              ? '部分字段不在该历史记录的 schema 中，值按空值保留。'
              : '部分数据已按读取上限截断，请缩小范围查看。'
          }}
        </p>
        <article
          v-for="receipt in preview.reads"
          :key="receipt.variable"
          class="reference-preview"
        >
          <header>
            <strong>
              {{
                value.find((binding) => binding.variable === receipt.variable)
                  ?.label ?? receipt.variable
              }}
            </strong>
            <ElTag
              :type="receipt.truncated ? 'warning' : 'info'"
              effect="plain"
            >
              {{ receipt.rowCount }} 行{{
                receipt.truncated ? ' · 已截断' : ''
              }}
            </ElTag>
          </header>
          <pre>{{
            JSON.stringify(preview.values[receipt.variable], null, 2)
          }}</pre>
        </article>
        <ElEmpty
          v-if="preview.reads.length === 0"
          description="本次没有可读取的数据"
        />
      </template>
    </ElDrawer>
  </section>
</template>
<style scoped>
.database-binding-editor {
  display: grid;
  gap: 16px;
  min-width: 0;
}

.reference-heading,
.reference-row,
.reference-pages,
.reference-preview header {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

h2 {
  font-size: 15px;
  font-weight: 600;
}

.reference-list {
  padding: 0;
  margin: 0;
  list-style: none;
}

.reference-row {
  gap: 8px;
  padding: 14px 0;
  border-bottom: 1px solid hsl(var(--border));
}

.reference-summary {
  flex: 1;
  min-width: 0;
}

.reference-name {
  max-width: 100%;
  height: auto;
  padding: 0;
  font-size: 13px;
  white-space: normal;
}

.reference-hint {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.7;
  color: hsl(var(--muted-foreground));
}

.reference-actions {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
}

.reference-actions :deep(.el-button) {
  margin: 0;
}

.reference-preview-actions {
  display: grid;
  gap: 12px;
}

.reference-form {
  display: grid;
  gap: 4px;
}

.reference-form :deep(.el-select) {
  width: 100%;
}

.reference-two-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.reference-two-fields :deep(.el-input-number) {
  width: 100%;
}

.fixed-record-picker {
  width: 100%;
}

.reference-filters {
  margin-bottom: 20px;
}

.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 12px 0;
}

.filter-row :deep(.el-select) {
  flex: 1;
  min-width: 0;
}

.filter-row :deep(.el-input) {
  flex: 1;
  min-width: 0;
}

.reference-preview {
  margin: 0 0 24px;
}

.reference-preview pre {
  padding: 16px;
  margin-top: 12px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: hsl(var(--muted) / 50%);
  border-radius: 8px;
}

@media (max-width: 650px) {
  .reference-two-fields {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .filter-row {
    flex-wrap: wrap;
  }

  .filter-row :deep(.el-select),
  .filter-row :deep(.el-input) {
    flex-basis: 40%;
  }
}
</style>
