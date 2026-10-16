<script setup lang="ts">
import type {
  KeyReference,
  ModelBinding,
  ProviderTarget,
} from '#/api/system/ai-application';

import { computed, ref, watch } from 'vue';

import { ElMessage } from 'element-plus';

import { applicationKeyOptions } from '#/api/system/ai-application';

const props = defineProps<{ disabled?: boolean; modelValue: ModelBinding }>();
const emit = defineEmits<{ 'update:modelValue': [value: ModelBinding] }>();
const options = ref<ProviderTarget[]>([]);
const loading = ref(false);
const error = ref('');
let serial = 0;
const key = (value: KeyReference) => `${value.keyRef}/${value.keyVersion}`;
const label = (value: KeyReference) =>
  options.value.find((item) => key(item.key) === key(value))?.maskedKeyLabel ??
  `引用 ${value.keyRef} · 版本 ${value.keyVersion}`;
const allowed = computed(() =>
  props.modelValue.allowedKeys.map((item) => key(item)),
);
const fixed = computed(() =>
  props.modelValue.fixedKey ? key(props.modelValue.fixedKey) : '',
);
const fallbacks = computed(() =>
  props.modelValue.fallbackKeys.map((item) => key(item)),
);
const fixedOptions = computed(() =>
  options.value.filter(
    (item) =>
      allowed.value.length === 0 || allowed.value.includes(key(item.key)),
  ),
);
async function load() {
  const run = ++serial;
  loading.value = true;
  error.value = '';
  try {
    const result = await applicationKeyOptions(props.modelValue.model);
    if (run === serial) options.value = result;
  } catch {
    if (run === serial) error.value = 'Key 候选读取失败。';
  } finally {
    if (run === serial) loading.value = false;
  }
}
function mode(value: 'AUTO' | 'FIXED') {
  if (value === 'AUTO') {
    emit('update:modelValue', {
      ...props.modelValue,
      keyMode: value,
      fixedKey: null,
      fallbackKeys: [],
    });
    return;
  }
  const first = fixedOptions.value[0];
  if (!first) {
    ElMessage.warning('请先读取可用 Key。');
    return;
  }
  emit('update:modelValue', {
    ...props.modelValue,
    keyMode: value,
    fixedKey: first.key,
    fallbackKeys: [],
  });
}
function references(values: string[]) {
  const pinned = [
    ...props.modelValue.allowedKeys,
    ...props.modelValue.fallbackKeys,
    ...(props.modelValue.fixedKey ? [props.modelValue.fixedKey] : []),
    ...options.value.map((item) => item.key),
  ];
  return values
    .map((value) => pinned.find((item) => key(item) === value))
    .filter((value): value is KeyReference => !!value);
}
function range(values: string[]) {
  emit('update:modelValue', {
    ...props.modelValue,
    allowedKeys: references(values),
  });
}
function chooseFixed(value: string) {
  const selected = references([value])[0];
  if (!selected) return;
  emit('update:modelValue', {
    ...props.modelValue,
    fixedKey: selected,
    fallbackKeys: props.modelValue.fallbackKeys.filter(
      (item) => key(item) !== value,
    ),
  });
}
function chooseFallbacks(values: string[]) {
  emit('update:modelValue', {
    ...props.modelValue,
    fallbackKeys: references(values).filter(
      (item) => key(item) !== fixed.value,
    ),
  });
}
function move(index: number, direction: number) {
  const values = [...props.modelValue.fallbackKeys];
  const next = index + direction;
  if (next < 0 || next >= values.length) return;
  const current = values[index];
  const target = values[next];
  if (!current || !target) return;
  values[index] = target;
  values[next] = current;
  emit('update:modelValue', { ...props.modelValue, fallbackKeys: values });
}
watch(
  () =>
    `${props.modelValue.model.modelRef}/${props.modelValue.model.configVersion}`,
  () => {
    options.value = [];
    serial++;
  },
);
</script>
<template>
  <details
    class="mt-2 rounded border p-3"
    @toggle="($event.target as HTMLDetailsElement).open && load()"
  >
    <summary class="cursor-pointer text-sm">
      Key 选择 · {{ modelValue.keyMode === 'AUTO' ? '自动' : '固定' }}
    </summary>
    <el-alert
      v-if="error"
      :title="error"
      type="warning"
      closable
      class="my-2"
      @close="error = ''"
    />
    <el-form label-position="top" :disabled="disabled">
      <el-form-item label="模式">
        <el-select :model-value="modelValue.keyMode" @change="mode">
          <el-option label="自动选择已验证可用 Key" value="AUTO" />
          <el-option label="固定 Key" value="FIXED" />
        </el-select>
        <el-button :loading="loading" class="ml-2" @click="load">
          刷新候选
        </el-button>
      </el-form-item>
      <el-form-item
        v-if="modelValue.keyMode === 'AUTO'"
        label="限制可用 Key（留空使用全部已验证搭配）"
      >
        <el-select
          :model-value="allowed"
          multiple
          clearable
          class="w-full"
          @change="range"
        >
          <el-option
            v-for="item in options"
            :key="key(item.key)"
            :label="item.maskedKeyLabel"
            :value="key(item.key)"
          />
        </el-select>
      </el-form-item>
      <template v-else>
        <el-form-item label="固定 Key">
          <el-select :model-value="fixed" class="w-full" @change="chooseFixed">
            <el-option
              v-for="item in fixedOptions"
              :key="key(item.key)"
              :label="item.maskedKeyLabel"
              :value="key(item.key)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="明确允许的备用 Key（留空不切换）">
          <el-select
            :model-value="fallbacks"
            multiple
            clearable
            class="w-full"
            @change="chooseFallbacks"
          >
            <el-option
              v-for="item in fixedOptions.filter(
                (item) => key(item.key) !== fixed,
              )"
              :key="key(item.key)"
              :label="item.maskedKeyLabel"
              :value="key(item.key)"
            />
          </el-select>
        </el-form-item>
        <div
          v-for="(item, index) in modelValue.fallbackKeys"
          :key="key(item)"
          class="my-1 flex items-center gap-2"
        >
          <span>{{ index + 1 }}. {{ label(item) }}</span>
          <el-button
            :disabled="disabled || index === 0"
            size="small"
            @click="move(index, -1)"
          >
            上移
          </el-button>
          <el-button
            :disabled="disabled || index === modelValue.fallbackKeys.length - 1"
            size="small"
            @click="move(index, 1)"
          >
            下移
          </el-button>
        </div>
      </template>
    </el-form>
  </details>
</template>
