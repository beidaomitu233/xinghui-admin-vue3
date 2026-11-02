<script setup lang="ts">
import type {
  KeyReference,
  ModelBinding,
  ProviderTarget,
} from '#/api/system/ai-application';

import { computed, nextTick, ref, watch } from 'vue';

import { VbenButtonGroup } from '@vben/common-ui';

import { ElMessage } from 'element-plus';

import { useVbenForm } from '#/adapter/form';
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
const expanded = ref<string[]>([]);
const values = () => ({
  mode: props.modelValue.keyMode,
  allowed: allowed.value,
  fixed: fixed.value,
  fallbacks: fallbacks.value,
});
const [Form, formApi] = useVbenForm({
  showDefaultActions: false,
  layout: 'vertical',
  wrapperClass: 'grid-cols-1',
  commonConfig: {
    componentProps: () => ({ class: 'w-full', disabled: props.disabled }),
  },
  schema: [
    {
      component: 'Select',
      fieldName: 'mode',
      label: '模式',
      componentProps: {
        options: [
          { label: '自动选择已验证可用 Key', value: 'AUTO' },
          { label: '固定 Key', value: 'FIXED' },
        ],
        onChange: async (value: 'AUTO' | 'FIXED') => {
          mode(value);
          await nextTick();
          await formApi.setValues(values());
        },
      },
    },
    {
      component: 'Select',
      fieldName: 'allowed',
      label: '限制可用 Key（留空使用全部已验证搭配）',
      dependencies: {
        triggerFields: ['mode'],
        if: () => props.modelValue.keyMode === 'AUTO',
      },
      componentProps: () => ({
        multiple: true,
        clearable: true,
        options: options.value.map((item) => ({
          value: key(item.key),
          label: item.maskedKeyLabel,
        })),
        onChange: range,
      }),
    },
    {
      component: 'Select',
      fieldName: 'fixed',
      label: '固定 Key',
      dependencies: {
        triggerFields: ['mode'],
        if: () => props.modelValue.keyMode === 'FIXED',
      },
      componentProps: () => ({
        options: fixedOptions.value.map((item) => ({
          value: key(item.key),
          label: item.maskedKeyLabel,
        })),
        onChange: chooseFixed,
      }),
    },
    {
      component: 'Select',
      fieldName: 'fallbacks',
      label: '后备 Key（按下方顺序）',
      dependencies: {
        triggerFields: ['mode', 'fixed'],
        if: () => props.modelValue.keyMode === 'FIXED',
      },
      componentProps: () => ({
        multiple: true,
        clearable: true,
        options: fixedOptions.value
          .filter((item) => key(item.key) !== fixed.value)
          .map((item) => ({
            value: key(item.key),
            label: item.maskedKeyLabel,
          })),
        onChange: chooseFallbacks,
      }),
    },
  ],
});
watch(
  () => JSON.stringify(values()),
  () => {
    void formApi.setValues(values());
  },
  { immediate: true },
);
</script>
<template>
  <el-collapse
    v-model="expanded"
    class="mt-2"
    @change="expanded.includes('keys') && load()"
  >
    <el-collapse-item
      name="keys"
      :title="`Key 选择 · ${modelValue.keyMode === 'AUTO' ? '自动' : '固定'}`"
    >
      <el-alert
        v-if="error"
        :title="error"
        type="warning"
        class="my-2"
        @close="error = ''"
      />
      <el-button :loading="loading" class="mb-3" @click="load">
        刷新候选
      </el-button>
      <Form />
      <template v-if="modelValue.keyMode === 'FIXED'">
        <div
          v-for="(item, index) in modelValue.fallbackKeys"
          :key="key(item)"
          class="my-1 flex items-center gap-2"
        >
          <span>{{ index + 1 }}. {{ label(item) }}</span>
          <VbenButtonGroup :gap="4" size="small">
            <el-button
              :disabled="disabled || index === 0"
              @click="move(index, -1)"
            >
              上移
            </el-button>
            <el-button
              :disabled="
                disabled || index === modelValue.fallbackKeys.length - 1
              "
              @click="move(index, 1)"
            >
              下移
            </el-button>
          </VbenButtonGroup>
        </div>
      </template>
    </el-collapse-item>
  </el-collapse>
</template>
