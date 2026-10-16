<script setup lang="ts">
import type { FieldValue, FormField, FormSchema } from '#/api/lowcode/forms';

const props = defineProps<{
  disabled?: boolean;
  modelValue: Record<string, FieldValue>;
  schema: FormSchema;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: Record<string, FieldValue>];
}>();
function setValue(field: FormField, value: FieldValue | undefined) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field.fieldKey]:
      value === '' && ['date', 'select'].includes(field.type)
        ? null
        : (value ?? null),
  });
}
const stringValue = (field: FormField) =>
  typeof props.modelValue[field.fieldKey] === 'string'
    ? String(props.modelValue[field.fieldKey])
    : '';
const numberValue = (field: FormField) =>
  typeof props.modelValue[field.fieldKey] === 'number'
    ? (props.modelValue[field.fieldKey] as number)
    : undefined;
function choiceValue(field: FormField): string | string[] {
  if (field.type !== 'multiselect') return stringValue(field);
  const value = props.modelValue[field.fieldKey];
  return Array.isArray(value) ? value : [];
}
</script>
<template>
  <!-- Prettier formats adjacent inline controls; avoid conflicting whitespace rules. -->
  <!-- eslint-disable vue/multiline-html-element-content-newline, vue/html-closing-bracket-newline -->
  <el-form label-position="top" :disabled="disabled">
    <el-form-item
      v-for="field in schema.fields"
      :key="field.fieldKey"
      :label="field.label"
      :required="field.required"
    >
      <el-input
        v-if="field.type === 'text' || field.type === 'textarea'"
        :model-value="stringValue(field)"
        :type="field.type === 'textarea' ? 'textarea' : 'text'"
        :rows="4"
        :maxlength="field.maxLength"
        show-word-limit
        @update:model-value="setValue(field, $event)"
      />
      <el-input-number
        v-else-if="field.type === 'number'"
        :model-value="numberValue(field)"
        :min="field.min ?? -1e12"
        :max="field.max ?? 1e12"
        :precision="6"
        @update:model-value="setValue(field, $event)"
      />
      <el-date-picker
        v-else-if="field.type === 'date'"
        :model-value="stringValue(field)"
        type="date"
        value-format="YYYY-MM-DD"
        placeholder="选择日期"
        @update:model-value="setValue(field, $event)"
      />
      <el-select
        v-else-if="field.type === 'select' || field.type === 'multiselect'"
        :model-value="choiceValue(field)"
        :multiple="field.type === 'multiselect'"
        clearable
        @update:model-value="setValue(field, $event)"
      >
        <el-option
          v-for="option in field.options"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
      <el-switch
        v-else-if="field.type === 'switch'"
        :model-value="modelValue[field.fieldKey] === true"
        @update:model-value="setValue(field, $event as boolean)"
      />
      <p v-if="field.help" class="mt-1 w-full text-sm text-muted-foreground">
        {{ field.help }}
      </p>
    </el-form-item>
  </el-form>
</template>
