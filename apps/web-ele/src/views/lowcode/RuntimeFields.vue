<script setup lang="ts">
import type { FieldValue, FormSchema } from '#/api/lowcode/forms';

import { nextTick, onBeforeUnmount, watch } from 'vue';

import { useVbenForm } from '#/adapter/form';

import { recordFormSchema } from './record-form';

const props = defineProps<{
  disabled?: boolean;
  modelValue: Record<string, FieldValue>;
  schema: FormSchema;
}>();
const emit = defineEmits<{
  submit: [];
  'update:modelValue': [value: Record<string, FieldValue>];
}>();
let generation = 0;
let loadedSchema = '';
let lastEmitted = '';
let syncing = false;
onBeforeUnmount(() => {
  generation++;
});
function values(
  input: Record<string, FieldValue | undefined>,
): Record<string, FieldValue> {
  return Object.fromEntries(
    props.schema.fields.map((field) => {
      let fallback: FieldValue = null;
      if (field.type === 'switch') fallback = false;
      if (field.type === 'multiselect') fallback = [];
      return [field.fieldKey, input[field.fieldKey] ?? fallback];
    }),
  );
}
const [Form, formApi] = useVbenForm({
  schema: [],
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1',
  commonConfig: { componentProps: { class: 'w-full' } },
  handleSubmit: submitValues,
  handleValuesChange: (input) => {
    if (syncing) return;
    const next = values(input);
    if (JSON.stringify(next) !== JSON.stringify(values(props.modelValue))) {
      lastEmitted = JSON.stringify(next);
      emit('update:modelValue', next);
    }
  },
});
async function submitValues(input: Record<string, FieldValue | undefined>) {
  emit('update:modelValue', values(input));
  await nextTick();
  emit('submit');
}
watch(
  () => props.disabled,
  (disabled) =>
    formApi.setState({ commonConfig: { disabled: disabled === true } }),
  { immediate: true },
);
watch(
  () => [props.schema, props.modelValue] as const,
  async () => {
    const run = ++generation;
    const signature = JSON.stringify(props.schema);
    const changed = signature !== loadedSchema;
    const next = values(props.modelValue);
    if (!changed && JSON.stringify(next) === lastEmitted) return;
    syncing = true;
    try {
      formApi.setState({
        ...(changed ? { schema: recordFormSchema(props.schema) } : {}),
      });
      await nextTick();
      if (run !== generation) return;
      if (signature === loadedSchema) {
        const current = await formApi.getValues();
        if (
          run === generation &&
          JSON.stringify(values(current)) !== JSON.stringify(next)
        )
          await formApi.setValues(next);
      } else {
        await formApi.resetForm({ values: next });
        if (run === generation) loadedSchema = signature;
      }
    } finally {
      if (run === generation) syncing = false;
    }
  },
  { immediate: true, deep: true },
);
</script>
<template>
  <Form @submit="submitValues"><slot name="actions"></slot></Form>
</template>
