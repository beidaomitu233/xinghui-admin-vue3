import type { FieldValue, FormField, FormSchema } from '#/api/lowcode/forms';

export const fieldTypes = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' },
  { value: 'select', label: '单选' },
  { value: 'multiselect', label: '多选' },
  { value: 'switch', label: '开关' },
] as const;
const keyPattern = /^[a-z][a-z0-9_]{0,49}$/u;
const reserved = new Set([
  'constructor',
  'createtime',
  'creator',
  'formid',
  'id',
  'isdeleted',
  'proto',
  'prototype',
  'revision',
  'schemaversion',
  'tenantid',
  'updatetime',
]);
export function newField(index: number): FormField {
  return {
    fieldKey: `field_${index}`,
    label: `字段${index}`,
    type: 'text',
    required: false,
    defaultValue: null,
    options: [],
    help: '',
    maxLength: 200,
    min: null,
    max: null,
    listVisible: true,
    searchable: false,
  };
}
export function initialData(schema: FormSchema): Record<string, FieldValue> {
  return Object.fromEntries(
    schema.fields.map((field) => {
      let value: FieldValue = null;
      if (field.defaultValue !== null) value = field.defaultValue;
      else if (field.type === 'switch') value = false;
      else if (field.type === 'multiselect') value = [];
      return [field.fieldKey, value];
    }),
  );
}
function valueError(
  field: FormField,
  value: FieldValue | undefined,
  required: boolean,
): string | undefined {
  const empty =
    value === null ||
    value === undefined ||
    (typeof value === 'string' && !value.trim()) ||
    (Array.isArray(value) && value.length === 0);
  if (empty && required) return `${field.label}为必填项`;
  if (value === null || value === undefined) return undefined;
  let valid = false;
  switch (field.type) {
    case 'date': {
      const date =
        typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
          ? new Date(`${value}T00:00:00Z`)
          : null;
      valid = Boolean(
        date &&
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value,
      );
      break;
    }
    case 'multiselect': {
      valid =
        Array.isArray(value) &&
        value.length <= 100 &&
        new Set(value).size === value.length &&
        value.every((item) =>
          field.options.some((option) => option.value === item),
        );
      break;
    }
    case 'number': {
      valid =
        typeof value === 'number' &&
        Number.isFinite(value) &&
        Math.abs(value) <= 1e12 &&
        (field.min === null || value >= field.min) &&
        (field.max === null || value <= field.max) &&
        Math.abs(value * 1e6 - Math.round(value * 1e6)) < 0.001;
      break;
    }
    case 'select': {
      valid =
        typeof value === 'string' &&
        field.options.some((option) => option.value === value);
      break;
    }
    case 'switch': {
      valid = typeof value === 'boolean';
      break;
    }
    case 'text':
    case 'textarea': {
      valid = typeof value === 'string' && value.length <= field.maxLength;
      break;
    }
  }
  return valid ? undefined : `${field.label}类型、范围或选项不正确`;
}
export function schemaError(schema: FormSchema): string | undefined {
  if (schema.fields.length === 0 || schema.fields.length > 100)
    return '字段数量须在1至100之间';
  const keys = new Set<string>();
  for (const field of schema.fields) {
    if (
      !keyPattern.test(field.fieldKey) ||
      reserved.has(field.fieldKey.replaceAll('_', '')) ||
      keys.has(field.fieldKey)
    )
      return '字段标识重复、保留或格式不正确';
    keys.add(field.fieldKey);
    if (
      !field.label.trim() ||
      field.label.length > 100 ||
      !fieldTypes.some((type) => type.value === field.type)
    )
      return '字段名称或类型不正确';
    if (
      field.help.length > 500 ||
      !Number.isInteger(field.maxLength) ||
      field.maxLength < 1 ||
      field.maxLength > (field.type === 'textarea' ? 5000 : 2000)
    )
      return '字段帮助或长度限制不正确';
    if (
      (field.min !== null &&
        (!Number.isFinite(field.min) || Math.abs(field.min) > 1e12)) ||
      (field.max !== null &&
        (!Number.isFinite(field.max) || Math.abs(field.max) > 1e12)) ||
      (field.min !== null && field.max !== null && field.min > field.max)
    )
      return '数字范围不正确';
    if (['multiselect', 'select'].includes(field.type)) {
      if (
        field.options.length === 0 ||
        field.options.length > 100 ||
        new Set(field.options.map((option) => option.value)).size !==
          field.options.length ||
        field.options.some(
          (option) =>
            !option.label.trim() ||
            option.label.length > 100 ||
            !/^[\w-]{1,100}$/u.test(option.value),
        )
      )
        return '选项名称、值或重复项不正确';
    } else if (field.options.length > 0) return '当前类型不支持选项';
    if (field.type === 'multiselect' && field.searchable)
      return '多选字段暂不支持查询条件';
    const error = valueError(field, field.defaultValue, false);
    if (error) return error;
  }
  return new TextEncoder().encode(JSON.stringify(schema)).length > 262_144
    ? '表单配置最多256KiB'
    : undefined;
}
export function dataError(
  schema: FormSchema,
  data: Record<string, FieldValue>,
): string | undefined {
  if (
    Object.keys(data).some(
      (key) => !schema.fields.some((field) => field.fieldKey === key),
    )
  )
    return '包含未定义或系统字段';
  for (const field of schema.fields) {
    const error = valueError(field, data[field.fieldKey], field.required);
    if (error) return error;
  }
  return new TextEncoder().encode(JSON.stringify(data)).length > 262_144
    ? '填写数据最多256KiB'
    : undefined;
}
export function displayValue(
  field: FormField,
  value: FieldValue | undefined,
): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'switch') return value ? '是' : '否';
  if (field.type === 'select' || field.type === 'multiselect')
    return (Array.isArray(value) ? value : [value])
      .map(
        (item) =>
          field.options.find((option) => option.value === item)?.label ??
          String(item),
      )
      .join('、');
  return String(value);
}
