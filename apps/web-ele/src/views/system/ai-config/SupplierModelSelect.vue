<script setup lang="ts">
import type { CatalogModel } from '#/api/system/ai-model-catalog';
import type { AiSettingsView } from '#/api/system/ai-settings';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { useAccessStore } from '@vben/stores';

import { ElAlert, ElOption, ElPagination, ElSelect } from 'element-plus';

import { catalogError, getStoredCatalog } from '#/api/system/ai-model-catalog';

const props = defineProps<{ channel?: AiSettingsView; modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const access = useAccessStore();
const records = ref<CatalogModel[]>([]);
const loading = ref(false);
const error = ref('');
const search = ref('');
const page = ref(1);
const total = ref(0);
const picked = ref<{ code: string; name: string }>();
let generation = 0;
const options = computed(() => {
  const term = search.value.toLocaleLowerCase();
  const result = new Map(
    (props.channel?.models ?? [])
      .filter((model) =>
        `${model.name} ${model.code}`.toLocaleLowerCase().includes(term),
      )
      .map((model) => [model.code, model]),
  );
  for (const model of records.value) result.set(model.code, model);
  if (picked.value?.code === props.modelValue)
    result.set(picked.value.code, picked.value);
  return [...result.values()];
});
async function load() {
  const run = ++generation;
  const channel = props.channel;
  const token = access.accessToken;
  records.value = [];
  total.value = 0;
  error.value = '';
  if (!channel) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const stored = await getStoredCatalog(channel.configId, {
      search: search.value,
      pageNum: page.value,
      pageSize: 50,
    });
    if (run !== generation || token !== access.accessToken) return;
    if (stored.revision !== channel.revision || stored.state === 'STALE') {
      error.value = '渠道已变化，请在供应商中重新获取模型目录。';
    } else if (stored.state === 'NOT_FETCHED') {
      error.value = '尚未获取供应商目录，当前只显示已配置模型。';
    } else {
      records.value = stored.catalog.records;
      total.value = stored.catalog.total;
    }
  } catch (error_) {
    if (run === generation && token === access.accessToken)
      error.value = catalogError(error_);
  } finally {
    if (run === generation) loading.value = false;
  }
}
function find(value: string) {
  search.value = value;
  page.value = 1;
  void load();
}
function choose(code: string) {
  picked.value = options.value.find((model) => model.code === code);
  emit('update:modelValue', code);
}
watch(
  () => [props.channel?.configId, props.channel?.revision, access.accessToken],
  () => {
    picked.value = undefined;
    search.value = '';
    page.value = 1;
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
});
</script>

<template>
  <div class="w-full">
    <ElSelect
      :model-value="modelValue"
      aria-label="供应商上游模型"
      placeholder="搜索供应商模型名称或 ID"
      filterable
      remote
      :remote-method="find"
      :loading="loading"
      :disabled="!channel"
      @update:model-value="choose"
    >
      <ElOption
        v-for="model in options"
        :key="model.code"
        :value="model.code"
        :label="`${model.name} — ${model.code}`"
      />
      <template v-if="total > 50" #footer>
        <ElPagination
          v-model:current-page="page"
          small
          layout="prev, pager, next"
          :total="total"
          :page-size="50"
          :pager-count="5"
          @current-change="load"
        />
      </template>
    </ElSelect>
    <ElAlert
      v-if="error"
      class="mt-2"
      :title="error"
      type="info"
      :closable="false"
    />
  </div>
</template>
