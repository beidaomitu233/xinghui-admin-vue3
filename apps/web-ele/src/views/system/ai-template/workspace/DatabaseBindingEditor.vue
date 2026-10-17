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
  databaseFields,
  databaseRelations,
  databaseTables,
  previewBindings,
} from '#/api/system/ai-database';

import { databaseFilterValue } from './database-filter-value';
import DatabaseRecordPicker from './DatabaseRecordPicker.vue';
import { cloneDataBinding } from './scene-save-adapter';
import SceneFormPicker from './SceneFormPicker.vue';

const props = defineProps<{
  preparePreview?: () => Promise<DataBinding[]>;
  readonly: boolean;
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
  editing.value = index;
  expanded.value = true;
  const binding = index === null ? undefined : props.value[index];
  sourceKind.value = canDatabase.value ? 'database' : 'lowcode';
  if (binding?.sourceKey.startsWith('lowcode.')) sourceKind.value = 'lowcode';
  sourceKey.value = binding?.sourceKey ?? '';
  mode.value = binding?.mode ?? 'FIELD';
  label.value = binding?.label ?? '';
  selectedFields.value = [...(binding?.fields ?? [])];
  filters.value = binding ? cloneDataBinding(binding).filters : [];
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
function chooseField(event: Event) {
  selectedFields.value = [(event.target as HTMLSelectElement).value];
}
function variableName(text: string) {
  const base =
    text.replaceAll(/[^\p{L}\p{N}_.]/gu, '_').slice(0, 100) || '数据引用';
  let name = base;
  let suffix = 2;
  while (
    props.value.some(
      (binding, index) => binding.variable === name && index !== editing.value,
    )
  )
    name = `${base}_${suffix++}`;
  return name;
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
  if (
    ['FIELD', 'ROW'].includes(mode.value) &&
    !currentRecord.value &&
    !record.value &&
    !previous?.row?.key
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
    variable: previous?.variable ?? variableName(text),
    label: text,
    sourceKey: sourceKey.value,
    mode: mode.value,
    fields: [...selectedFields.value],
    filters: filters.value.map((filter) => ({ ...filter })),
    limit: ['FIELD', 'ROW'].includes(mode.value) ? 1 : limit.value,
    row: ['FIELD', 'ROW'].includes(mode.value)
      ? {
          currentRecord: currentRecord.value,
          key: currentRecord.value
            ? {}
            : (record.value?.key ?? previous?.row?.key ?? {}),
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
function setFilterValue(index: number, event: Event) {
  const filter = filters.value[index];
  if (!filter) return;
  const field = fields.value.find((item) => item.field === filter.field);
  const text = (event.target as HTMLInputElement).value;
  const value = databaseFilterValue(field?.type ?? '', text);
  filter.value = value;
}
function useRelation(event: Event) {
  if (!(event.target as HTMLSelectElement).value) return;
  const relation =
    availableRelations.value[Number((event.target as HTMLSelectElement).value)];
  if (relation) {
    parentField.value = relation.parentField;
    childField.value = relation.childField;
  }
}
async function previewData() {
  if (previewing.value || props.value.length === 0) return;
  if (currentSource.value && !previewRecord.value) {
    error.value = '请为当前记录引用选择一条预览记录。';
    return;
  }
  let run = ++previewGeneration;
  previewing.value = true;
  error.value = '';
  try {
    const bindings = props.preparePreview
      ? await props.preparePreview()
      : props.value.map((binding) => cloneDataBinding(binding));
    await nextTick();
    if (!alive) return;
    run = ++previewGeneration;
    const result = await previewBindings({
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
});
</script>
<template>
  <section class="database-binding-editor" aria-label="数据库引用">
    <header>
      <h2>数据库引用</h2>
      <button v-if="!readonly" type="button" @click="begin()">
        添加数据引用
      </button>
    </header>
    <p v-if="value.length === 0" class="muted">
      选择表和字段、整表数据或关联子表，然后一键插入提示词。
    </p>
    <article
      v-for="(binding, index) in value"
      :key="binding.variable"
      class="binding-item"
    >
      <div>
        <strong>{{ binding.label }}</strong>
        <small>{{ modeLabels[binding.mode] }}</small>
      </div>
      <button
        type="button"
        :disabled="readonly"
        @click="emit('insert', binding.variable)"
      >
        插入引用
      </button>
      <button v-if="!readonly" type="button" @click="begin(index)">修改</button>
      <button v-if="!readonly" type="button" @click="remove(index)">
        移除
      </button>
    </article>
    <section v-if="expanded && !readonly" class="binding-builder">
      <label>
        数据来源
        <select
          v-model="sourceKind"
          aria-label="数据来源"
          @change="
            sourceKey = '';
            changeSource();
          "
        >
          <option v-if="canDatabase" value="database">数据库表</option>
          <option value="lowcode">低代码表单</option>
        </select>
      </label>
      <SceneFormPicker
        v-if="sourceKind === 'lowcode'"
        :disabled="readonly"
        :value="sourceKey.startsWith('lowcode.') ? sourceKey.slice(8) : ''"
        @change="
          sourceKey = `lowcode.${$event}`;
          changeSource();
        "
      />
      <template v-else>
        <div class="table-search">
          <input
            v-model="keyword"
            aria-label="搜索数据库表"
            placeholder="按表名或备注搜索"
            maxlength="100"
          />
          <button
            type="button"
            :disabled="loading"
            @click="
              page = 1;
              loadTables();
            "
          >
            搜索表
          </button>
        </div>
        <label>
          业务表
          <select
            v-model="sourceKey"
            aria-label="业务表"
            @change="changeSource"
          >
            <option value="" disabled>选择实际表或低代码表单</option>
            <option
              v-if="
                sourceKey &&
                !tables.some((item) => item.sourceKey === sourceKey)
              "
              :value="sourceKey"
            >
              当前已保存的表
            </option>
            <option
              v-for="item in tables"
              :key="item.sourceKey"
              :value="item.sourceKey"
            >
              {{ item.label || item.comment || item.tableName }}（{{
                item.tableName
              }}）
            </option>
          </select>
        </label>
        <div class="table-pages">
          <button
            type="button"
            :disabled="page <= 1 || loading"
            @click="
              page--;
              loadTables();
            "
          >
            上一页
          </button>
          <span>第 {{ page }} 页</span>
          <button
            type="button"
            :disabled="BigInt(page * 20) >= BigInt(total) || loading"
            @click="
              page++;
              loadTables();
            "
          >
            下一页
          </button>
        </div>
      </template>
      <label>
        取数方式
        <select
          v-model="mode"
          aria-label="取数方式"
          @change="selectedFields = []"
        >
          <option v-for="(text, key) in modeLabels" :key="key" :value="key">
            {{ text }}
          </option>
        </select>
      </label>
      <label v-if="mode === 'FIELD'">
        字段
        <select
          aria-label="引用字段"
          :value="selectedFields[0] ?? ''"
          @change="chooseField"
        >
          <option value="" disabled>选择实际字段</option>
          <option
            v-for="field in fields"
            :key="field.field"
            :value="field.field"
          >
            {{ field.label || field.field }}（{{ field.field }} ·
            {{ field.type }}）
          </option>
        </select>
      </label>
      <fieldset v-else>
        <legend>包含字段（不勾选表示全部可读字段）</legend>
        <label v-for="field in fields" :key="field.field" class="inline-option">
          <input
            v-model="selectedFields"
            type="checkbox"
            :value="field.field"
          />
          {{ field.label || field.field }}（{{ field.field }} ·
          {{ field.type }}）
        </label>
      </fieldset>
      <template v-if="['FIELD', 'ROW'].includes(mode)">
        <label class="inline-option">
          <input v-model="currentRecord" type="checkbox" />
          随当前业务记录取数
        </label>
        <DatabaseRecordPicker
          v-if="sourceKey && !currentRecord"
          v-model="record"
          :source-key="sourceKey"
          label="选择固定记录"
        />
      </template>
      <template v-if="mode === 'CHILDREN'">
        <p v-if="parents.length === 0" class="muted">
          请先添加一条主记录引用，再选择关联子表。
        </p>
        <label>
          主记录引用
          <select v-model="parentVariable" aria-label="主记录引用">
            <option value="" disabled>选择前面添加的整条记录</option>
            <option
              v-for="parent in parents"
              :key="parent.variable"
              :value="parent.variable"
            >
              {{ parent.label }}
            </option>
          </select>
        </label>
        <label v-if="availableRelations.length > 0">
          已发现的关联
          <select aria-label="数据库关联" @change="useRelation">
            <option value="">也可手动选择关联字段</option>
            <option
              v-for="(relation, index) in availableRelations"
              :key="relation.name"
              :value="String(index)"
            >
              {{ relation.parentField }} → {{ relation.childField }}
            </option>
          </select>
        </label>
        <div class="relation-fields">
          <label>
            主记录关联字段
            <select v-model="parentField" aria-label="主记录关联字段">
              <option value="" disabled>选择主表字段</option>
              <option
                v-for="field in parentFields"
                :key="field.field"
                :value="field.field"
              >
                {{ field.label || field.field }}（{{ field.field }}）
              </option>
            </select>
          </label>
          <label>
            子表对应字段
            <select v-model="childField" aria-label="子表关联字段">
              <option value="" disabled>选择子表字段</option>
              <option
                v-for="field in fields"
                :key="field.field"
                :value="field.field"
              >
                {{ field.label || field.field }}（{{ field.field }}）
              </option>
            </select>
          </label>
        </div>
      </template>
      <section v-if="sourceKey" class="binding-filters">
        <header>
          <h3>筛选条件（全部满足）</h3>
          <button
            type="button"
            :disabled="filters.length >= 16 || !fields[0]"
            @click="
              filters.push({
                field: fields[0]?.field || '',
                operator: 'EQ',
                value: '',
              })
            "
          >
            增加条件
          </button>
        </header>
        <div v-for="(filter, index) in filters" :key="index" class="filter-row">
          <select v-model="filter.field" aria-label="筛选字段">
            <option
              v-for="field in fields"
              :key="field.field"
              :value="field.field"
            >
              {{ field.label || field.field }}
            </option>
          </select>
          <select
            v-model="filter.operator"
            aria-label="筛选比较方式"
            @change="
              filter.value = ['IS_NULL', 'NOT_NULL'].includes(filter.operator)
                ? null
                : ''
            "
          >
            <option
              v-for="operator in operators"
              :key="operator.value"
              :value="operator.value"
            >
              {{ operator.label }}
            </option>
          </select>
          <select
            v-if="
              /^(?:boolean|bool)\b/i.test(
                fields.find((field) => field.field === filter.field)?.type ??
                  '',
              ) && !['IS_NULL', 'NOT_NULL'].includes(filter.operator)
            "
            aria-label="布尔筛选值"
            :value="String(filter.value)"
            @change="setFilterValue(index, $event)"
          >
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
          <input
            v-else-if="!['IS_NULL', 'NOT_NULL'].includes(filter.operator)"
            aria-label="筛选值"
            :value="filter.value ?? ''"
            @input="setFilterValue(index, $event)"
          />
          <button type="button" @click="filters.splice(index, 1)">
            移除条件
          </button>
        </div>
      </section>
      <label v-if="['TABLE', 'CHILDREN'].includes(mode)">
        最多取数行数
        <input
          v-model.number="limit"
          aria-label="最多取数行数"
          type="number"
          min="1"
          max="200"
        />
      </label>
      <label>
        引用名称
        <input
          v-model="label"
          aria-label="引用名称"
          placeholder="留空按表和字段名称生成"
          maxlength="100"
        />
      </label>
      <footer>
        <button type="button" @click="expanded = false">取消</button>
        <button
          type="button"
          :disabled="!sourceKey || fields.length === 0"
          @click="add"
        >
          添加并插入提示词
        </button>
      </footer>
    </section>
    <DatabaseRecordPicker
      v-if="currentSource"
      v-model="previewRecord"
      :source-key="currentSource"
      :readonly="previewing"
      label="选择本次预览与试运行的业务记录"
    />
    <button
      v-if="value.length > 0"
      type="button"
      :disabled="previewing"
      @click="previewData"
    >
      {{ previewing ? '正在读取实际数据…' : '预览实际数据' }}
    </button>
    <p v-if="error" role="alert">{{ error }}</p>
    <section v-if="preview" class="binding-preview" aria-label="实际数据预览">
      <h3>实际数据预览</h3>
      <p v-for="(notice, index) in preview.notices" :key="index" class="muted">
        {{
          notice.code === 'FIELD_NOT_IN_RECORD_SCHEMA'
            ? '部分字段不在该历史记录的 schema 中，值按空值保留。'
            : '部分数据已按读取上限截断，请缩小范围查看。'
        }}
      </p>
      <article v-for="receipt in preview.reads" :key="receipt.variable">
        <header>
          <strong>
            {{
              value.find((binding) => binding.variable === receipt.variable)
                ?.label || receipt.variable
            }}
          </strong>
          <span>
            {{ receipt.rowCount }} 行{{
              receipt.truncated ? ' · 已按上限截断' : ''
            }}
          </span>
        </header>
        <pre>{{
          JSON.stringify(preview.values[receipt.variable], null, 2)
        }}</pre>
      </article>
      <p v-if="preview.reads.length === 0" class="muted">
        本次没有可读取的数据。
      </p>
    </section>
  </section>
</template>
<style scoped>
.database-binding-editor,
.binding-builder {
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

header,
footer,
.binding-item,
.table-search,
.table-pages,
.filter-row,
.relation-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

header {
  justify-content: space-between;
}

h2,
h3 {
  font-size: 14px;
  font-weight: 600;
}

.binding-item {
  padding: 12px;
  background: hsl(var(--accent));
  border-radius: 8px;
}

.binding-item div {
  display: grid;
  flex: 1;
  gap: 6px;
}

small,
.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

label {
  display: grid;
  flex: 1;
  gap: 8px;
  font-size: 13px;
}

input:not([type='checkbox']),
select {
  min-width: 0;
  padding: 9px 12px;
  color: inherit;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.inline-option {
  display: flex;
  gap: 8px;
  align-items: center;
}

fieldset {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 14px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.binding-filters {
  display: grid;
  gap: 12px;
}

button {
  color: hsl(var(--primary));
}

button:disabled {
  opacity: 0.5;
}

pre {
  padding: 14px;
  overflow: auto;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: hsl(var(--accent));
  border-radius: 8px;
}

[role='alert'] {
  font-size: 13px;
  color: hsl(var(--destructive));
}

@media (max-width: 760px) {
  fieldset {
    grid-template-columns: 1fr;
  }

  .filter-row,
  .relation-fields {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
