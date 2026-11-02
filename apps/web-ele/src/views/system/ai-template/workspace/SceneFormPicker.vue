<script setup lang="ts">
import type { SceneDataForm } from '#/api/system/ai-scene-data';

import { onBeforeUnmount, onMounted, ref } from 'vue';

import { ElAlert, ElOption, ElPagination, ElSelect } from 'element-plus';

import { sceneDataForms } from '#/api/system/ai-scene-data';

const props = defineProps<{ disabled: boolean; value: string }>();
const emit = defineEmits<{ change: [value: string] }>();
const forms = ref<SceneDataForm[]>([]);
const keyword = ref('');
const page = ref(1);
const total = ref(0);
const error = ref('');
const loading = ref(false);
let generation = 0;
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  const run = ++generation;
  loading.value = true;
  try {
    const result = await sceneDataForms({
      keyword: keyword.value,
      pageNum: page.value,
      pageSize: 20,
    });
    if (!disposed && run === generation) {
      forms.value = result.records;
      const count = Number(result.total);
      if (!Number.isSafeInteger(count) || count < 0)
        throw new Error('Invalid total');
      total.value = count;
      error.value = '';
    }
  } catch {
    if (!disposed && run === generation) error.value = '表单读取失败，请重试。';
  } finally {
    if (!disposed && run === generation) loading.value = false;
  }
}
function search(value: string) {
  keyword.value = value;
  page.value = 1;
  generation++;
  clearTimeout(timer);
  timer = setTimeout(() => void load(), 250);
}
function choose(value: string) {
  if (!props.disabled && forms.value.some((form) => form.formId === value))
    emit('change', value);
}
onMounted(load);
onBeforeUnmount(() => {
  disposed = true;
  generation++;
  clearTimeout(timer);
});
</script>
<template>
  <div class="scene-form-picker" aria-label="选择绑定表单">
    <ElSelect
      aria-label="绑定表单"
      :model-value="value"
      :disabled="disabled"
      filterable
      remote
      :remote-method="search"
      :loading="loading"
      placeholder="按表单名称搜索"
      @change="choose"
    >
      <ElOption
        v-if="value && !forms.some((form) => form.formId === value)"
        :value="value"
        label="已保存表单"
      />
      <ElOption
        v-for="form in forms"
        :key="form.formId"
        :label="form.name"
        :value="form.formId"
      />
      <template #footer>
        <ElPagination
          v-model:current-page="page"
          :disabled="disabled || loading"
          :page-size="20"
          :total="total"
          layout="prev,pager,next"
          small
          @click.stop
          @current-change="load"
        />
      </template>
    </ElSelect>
    <ElAlert
      v-if="error"
      :title="error"
      type="error"
      closable
      @close="error = ''"
    />
  </div>
</template>
