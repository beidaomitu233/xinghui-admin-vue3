<script setup lang="ts">
import type {
  DatabaseField,
  DatabaseRecord,
  DataFilter,
} from '#/api/system/ai-database';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  ElAlert,
  ElButton,
  ElFormItem,
  ElInput,
  ElOption,
  ElPopover,
  ElSelect,
} from 'element-plus';

import { databaseFields, databaseRecords } from '#/api/system/ai-database';

import { databaseFilterValue } from './database-filter-value';

const props = defineProps<{
  label?: string;
  modelValue: DatabaseRecord | null;
  readonly?: boolean;
  sourceKey: string;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: DatabaseRecord | null];
}>();
const fields = ref<DatabaseField[]>([]);
const rows = ref<DatabaseRecord[]>([]);
const filterField = ref('');
const keyword = ref('');
const selected = ref('');
const loading = ref(false);
const truncated = ref(false);
const error = ref('');
const limit = ref(20);
const filterOpen = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let alive = true;
watch(
  () => props.modelValue,
  (value) => {
    if (!value) selected.value = '';
  },
);
const booleanSearch = computed(() =>
  /^(?:bool|boolean)\b/i.test(
    fields.value.find((field) => field.field === filterField.value)?.type ?? '',
  ),
);
async function load() {
  if (!props.sourceKey || props.readonly) return;
  clearTimeout(searchTimer);
  const run = ++generation;
  loading.value = true;
  error.value = '';
  try {
    const filters: DataFilter[] = [];
    const field = fields.value.find((item) => item.field === filterField.value);
    if (keyword.value && field) {
      const value = databaseFilterValue(field.type, keyword.value);
      filters.push({
        field: field.field,
        operator:
          typeof value === 'string' && /char|text|string/i.test(field.type)
            ? 'CONTAINS'
            : 'EQ',
        value,
      });
    }
    const result = await databaseRecords({
      sourceKey: props.sourceKey,
      filters,
      limit: limit.value,
    });
    if (!alive || run !== generation) return;
    rows.value = result.records;
    truncated.value = result.truncated;
    const index = props.modelValue
      ? rows.value.findIndex(
          (row) =>
            row.businessRef?.type === props.modelValue?.businessRef?.type &&
            row.businessRef?.id === props.modelValue?.businessRef?.id,
        )
      : -1;
    selected.value = index < 0 ? '' : String(index);
    emit('update:modelValue', index < 0 ? null : (rows.value[index] ?? null));
  } catch {
    if (alive && run === generation) {
      rows.value = [];
      error.value = '记录读取失败或当前无读取权限，请重试。';
    }
  } finally {
    if (alive && run === generation) loading.value = false;
  }
}
function choose(value: string) {
  if (props.readonly) return;
  const raw = value;
  if (raw === '') {
    emit('update:modelValue', null);
    return;
  }
  const index = Number(raw);
  emit(
    'update:modelValue',
    Number.isSafeInteger(index) ? (rows.value[index] ?? null) : null,
  );
}
function searchRecords(value: string) {
  keyword.value = value;
  limit.value = 20;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void load(), 250);
}
watch(
  () => props.sourceKey,
  async (sourceKey) => {
    const run = ++generation;
    fields.value = [];
    rows.value = [];
    selected.value = '';
    keyword.value = '';
    limit.value = 20;
    emit('update:modelValue', null);
    if (!sourceKey) return;
    try {
      const metadata = await databaseFields(sourceKey);
      if (!alive || run !== generation) return;
      fields.value = metadata.fields;
      filterField.value =
        metadata.fields.find((field) => /char|text|string/i.test(field.type))
          ?.field ??
        metadata.fields[0]?.field ??
        '';
      await load();
    } catch {
      if (alive && run === generation)
        error.value = '字段目录读取失败或无权访问。';
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  alive = false;
  generation++;
  clearTimeout(searchTimer);
});
</script>
<template>
  <div class="database-record-picker" aria-label="选择业务记录">
    <div class="record-picker-line">
      <ElSelect
        v-model="selected"
        aria-label="业务记录"
        :placeholder="label || '搜索并选择业务记录'"
        filterable
        remote
        :remote-method="searchRecords"
        :disabled="readonly"
        :loading="loading"
        clearable
        @change="choose($event ?? '')"
      >
        <ElOption
          v-for="(record, index) in rows"
          :key="index"
          :value="String(index)"
          :label="record.label"
        />
        <template #footer>
          <ElButton
            v-if="truncated && limit < 200"
            link
            type="primary"
            :disabled="loading"
            @click="
              limit = Math.min(limit + 20, 200);
              load();
            "
          >
            显示更多记录
          </ElButton>
          <span v-else-if="truncated" class="record-hint">
            已显示前 {{ limit }} 条，请缩小筛选范围
          </span>
        </template>
      </ElSelect>
      <ElPopover
        v-model:visible="filterOpen"
        trigger="click"
        placement="bottom-end"
        :width="320"
      >
        <template #reference>
          <ElButton :disabled="readonly" aria-label="筛选业务记录">
            筛选
          </ElButton>
        </template>
        <div class="record-filter">
          <ElFormItem label="搜索字段">
            <ElSelect
              v-model="filterField"
              aria-label="记录搜索字段"
              filterable
              :disabled="readonly || loading"
              @change="keyword = ''"
            >
              <ElOption
                v-for="field in fields"
                :key="field.field"
                :value="field.field"
                :label="field.label || field.field"
              />
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="搜索内容">
            <ElInput
              v-if="!booleanSearch"
              v-model="keyword"
              aria-label="记录搜索值"
              placeholder="输入字段内容"
              :readonly="readonly"
              @keydown.enter.prevent="
                load();
                filterOpen = false;
              "
            />
            <ElSelect
              v-else
              v-model="keyword"
              aria-label="记录搜索值"
              :disabled="readonly"
            >
              <ElOption label="不限" value="" />
              <ElOption label="是" value="true" />
              <ElOption label="否" value="false" />
            </ElSelect>
          </ElFormItem>
          <ElButton
            type="primary"
            :loading="loading"
            @click="
              load();
              filterOpen = false;
            "
          >
            搜索记录
          </ElButton>
        </div>
      </ElPopover>
    </div>
    <ElAlert
      v-if="error"
      :title="error"
      type="error"
      closable
      @close="error = ''"
      class="record-error"
    />
  </div>
</template>
<style scoped>
.database-record-picker {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.record-picker-line {
  display: flex;
  gap: 8px;
  align-items: center;
}

.record-picker-line :deep(.el-select) {
  flex: 1;
  min-width: 0;
}

.record-filter {
  display: grid;
  gap: 6px;
}

.record-filter :deep(.el-form-item) {
  display: block;
}

.record-filter :deep(.el-select) {
  width: 100%;
}

.record-hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.record-error {
  font-size: 12px;
}
</style>
