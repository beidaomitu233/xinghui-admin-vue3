<script setup lang="ts">
import type {
  DatabaseField,
  DatabaseRecord,
  DataFilter,
} from '#/api/system/ai-database';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

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
    selected.value = '';
    emit('update:modelValue', null);
  } catch {
    if (alive && run === generation) {
      rows.value = [];
      error.value = '记录读取失败或当前无读取权限，请重试。';
    }
  } finally {
    if (alive && run === generation) loading.value = false;
  }
}
function choose(event: Event) {
  if (props.readonly) return;
  const raw = (event.target as HTMLSelectElement).value;
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
});
</script>
<template>
  <section class="database-record-picker" aria-label="选择业务记录">
    <h3>{{ label || '选择业务记录' }}</h3>
    <div class="record-search">
      <select
        v-model="filterField"
        aria-label="记录搜索字段"
        @change="keyword = ''"
        :disabled="readonly || loading"
      >
        <option v-for="field in fields" :key="field.field" :value="field.field">
          {{ field.label || field.field }}
        </option>
      </select>
      <input
        v-if="!booleanSearch"
        v-model="keyword"
        aria-label="记录搜索值"
        :readonly="readonly"
        placeholder="输入内容筛选记录"
        @keydown.enter.prevent="load"
      />
      <select
        v-else
        v-model="keyword"
        aria-label="记录搜索值"
        :disabled="readonly || loading"
      >
        <option value="">不限</option>
        <option value="true">是</option>
        <option value="false">否</option>
      </select>
      <button type="button" :disabled="readonly || loading" @click="load">
        搜索记录
      </button>
    </div>
    <select
      v-model="selected"
      aria-label="业务记录"
      :disabled="readonly || loading"
      @change="choose"
    >
      <option value="" disabled>
        {{ loading ? '正在读取记录…' : '按名称选择记录' }}
      </option>
      <option
        v-for="(record, index) in rows"
        :key="index"
        :value="String(index)"
      >
        {{ record.label }}
      </option>
    </select>
    <p v-if="!loading && rows.length === 0 && !error" class="muted">
      没有符合条件的有权记录。
    </p>
    <p v-if="truncated" class="muted">
      只显示前 {{ limit }} 条记录，请缩小筛选范围。
      <button
        v-if="limit < 200"
        type="button"
        :disabled="readonly"
        @click="
          limit = Math.min(limit + 20, 200);
          load();
        "
      >
        加载更多
      </button>
    </p>
    <p v-if="modelValue" class="muted">已选择：{{ modelValue.label }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.database-record-picker {
  display: grid;
  gap: 12px;
  padding: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

h3 {
  font-size: 13px;
  font-weight: 600;
}

.record-search {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

select,
input {
  min-width: 0;
  padding: 9px 12px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.record-search input {
  flex: 1;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

button {
  color: hsl(var(--primary));
}

[role='alert'] {
  font-size: 13px;
  color: hsl(var(--destructive));
}
</style>
