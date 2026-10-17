<script setup lang="ts">
import type { SceneDataForm } from '#/api/system/ai-scene-data';

import { onBeforeUnmount, onMounted, ref } from 'vue';

import { sceneDataForms } from '#/api/system/ai-scene-data';

defineProps<{ disabled: boolean; value: string }>();
const emit = defineEmits<{ change: [value: string] }>();
const forms = ref<SceneDataForm[]>([]);
const keyword = ref('');
const page = ref(1);
const total = ref('0');
const error = ref('');
let generation = 0;
let disposed = false;
async function load() {
  const run = ++generation;
  try {
    const result = await sceneDataForms({
      keyword: keyword.value,
      pageNum: page.value,
      pageSize: 20,
    });
    if (!disposed && run === generation) {
      forms.value = result.records;
      total.value = result.total;
      error.value = '';
    }
  } catch {
    if (!disposed && run === generation) error.value = '表单读取失败，请重试。';
  }
}
function choose(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  if (forms.value.some((form) => form.formId === value)) emit('change', value);
}
onMounted(load);
onBeforeUnmount(() => {
  disposed = true;
  generation++;
});
</script>
<template>
  <section aria-label="选择绑定表单">
    <div class="search">
      <input
        v-model="keyword"
        aria-label="搜索绑定表单"
        maxlength="100"
        placeholder="按表单名称搜索"
        :disabled="disabled"
      />
      <button
        type="button"
        :disabled="disabled"
        @click="
          page = 1;
          load();
        "
      >
        搜索
      </button>
    </div>
    <select
      aria-label="绑定表单"
      :value="value"
      :disabled="disabled"
      @change="choose"
    >
      <option value="" disabled>选择表单</option>
      <option v-for="form in forms" :key="form.formId" :value="form.formId">
        {{ form.name }}
      </option>
    </select>
    <div class="pages">
      <button
        type="button"
        :disabled="disabled || page <= 1"
        @click="
          page--;
          load();
        "
      >
        上一页
      </button>
      <span>第 {{ page }} 页</span>
      <button
        type="button"
        :disabled="disabled || BigInt(page * 20) >= BigInt(total)"
        @click="
          page++;
          load();
        "
      >
        下一页
      </button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<style scoped>
.search,
.pages {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 10px 0;
}

input,
select {
  width: 100%;
  padding: 9px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

button {
  color: hsl(var(--primary));
  white-space: nowrap;
}

button:disabled {
  opacity: 0.45;
}

.pages,
[role='alert'] {
  font-size: 12px;
}
</style>
