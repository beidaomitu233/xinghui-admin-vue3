import type {
  FieldType,
  FieldValue,
  FormField,
  FormSchema,
} from '#/api/lowcode/forms';

import { schemaError } from '../form-schema';

export interface DesignerRule {
  type: string;
  field: string;
  title: string;
  info?: string;
  value: FieldValue;
  $required: boolean | string;
  props: Record<string, unknown>;
  options?: { label: string; value: string }[];
  listVisible: boolean;
  searchable: boolean;
  _fc_drag_tag?: string;
}
const componentTypes: Record<FieldType, string> = {
  text: 'input',
  textarea: 'input',
  number: 'inputNumber',
  date: 'datePicker',
  select: 'select',
  multiselect: 'select',
  switch: 'switch',
};
export function schemaToDesigner(schema: FormSchema): DesignerRule[] {
  const error = schemaError(schema);
  if (error) throw new Error(error);
  return schema.fields.map((field) => ({
    type: componentTypes[field.type],
    field: field.fieldKey,
    title: field.label,
    info: field.help,
    value: structuredClone(field.defaultValue),
    $required: field.required,
    listVisible: field.listVisible,
    searchable: field.searchable,
    _fc_drag_tag: `lowcode_${field.type}`,
    props: designerProps(field),
    ...(['multiselect', 'select'].includes(field.type)
      ? { options: structuredClone(field.options) }
      : {}),
  }));
}
function designerProps(field: FormField): Record<string, unknown> {
  switch (field.type) {
    case 'date': {
      return { type: 'date', valueFormat: 'YYYY-MM-DD' };
    }
    case 'multiselect':
    case 'select': {
      return { multiple: field.type === 'multiselect' };
    }
    case 'number': {
      return { min: field.min, max: field.max, precision: 6 };
    }
    case 'switch': {
      return { activeValue: true, inactiveValue: false };
    }
    default: {
      return {
        type: field.type === 'textarea' ? 'textarea' : 'text',
        maxlength: field.maxLength,
      };
    }
  }
}
function numericBound(value: unknown): null | number {
  return value === null || value === undefined ? null : Number(value);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('设计器规则格式不正确');
  return value as Record<string, unknown>;
}
function meaningful(value: unknown): boolean {
  if (value === undefined || value === null || value === '' || value === false)
    return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object')
    return Object.values(value).some((item) => meaningful(item));
  return true;
}
export function designerToSchema(
  input: unknown[],
  previous: FormSchema,
): FormSchema {
  if (!Array.isArray(input) || input.length > 100)
    throw new Error('最多支持100个字段');
  const oldFields = new Map(
    previous.fields.map((field) => [field.fieldKey, field]),
  );
  const fields = input.map((value): FormField => {
    const rule = object(value);
    const props = rule.props === undefined ? {} : object(rule.props);
    if (
      [
        'children',
        'on',
        'control',
        'effect',
        'compute',
        'computed',
        '_computed',
        'validate',
        'component',
        'hook',
        'fetch',
        'hidden',
        '_hidden',
      ].some((key) => meaningful(rule[key]))
    )
      throw new Error('当前表单不支持嵌套、事件、远程请求或自定义校验');
    if (rule.display === false || rule._display === false)
      throw new Error('当前表单不支持隐藏字段');
    let type: FieldType;
    switch (rule.type) {
      case 'datePicker': {
        if (
          (props.type && props.type !== 'date') ||
          (props.valueFormat && props.valueFormat !== 'YYYY-MM-DD')
        )
          throw new Error('日期仅支持YYYY-MM-DD');
        type = 'date';
        break;
      }
      case 'input': {
        if (props.type && !['text', 'textarea'].includes(String(props.type)))
          throw new Error('文本字段仅支持单行或多行');
        type = props.type === 'textarea' ? 'textarea' : 'text';
        break;
      }
      case 'inputNumber': {
        type = 'number';
        break;
      }
      case 'select': {
        type = props.multiple === true ? 'multiselect' : 'select';
        break;
      }
      case 'switch': {
        if (
          (props.activeValue !== undefined && props.activeValue !== true) ||
          (props.inactiveValue !== undefined && props.inactiveValue !== false)
        )
          throw new Error('开关须使用布尔值');
        type = 'switch';
        break;
      }
      default: {
        throw new Error('仅支持当前七种标准字段');
      }
    }
    if (
      [
        'remote',
        'remoteMethod',
        'allowCreate',
        'formatter',
        'parser',
        'disabledDate',
      ].some((key) => meaningful(props[key]))
    )
      throw new Error('当前字段不支持远程选项或函数配置');
    if (
      ['multiselect', 'select'].includes(type) &&
      (!Array.isArray(rule.options) ||
        rule.options.some((entry) => {
          const option = object(entry);
          return (
            typeof option.label !== 'string' || typeof option.value !== 'string'
          );
        }))
    )
      throw new Error('选项名称和值必须为文本');
    const old = oldFields.get(String(rule.field));
    if (
      typeof rule.field !== 'string' ||
      typeof rule.title !== 'string' ||
      (rule.info !== undefined && typeof rule.info !== 'string')
    )
      throw new Error('字段标识、名称和帮助必须为文本');
    if (rule.listVisible !== undefined && typeof rule.listVisible !== 'boolean')
      throw new Error('列表显示配置不正确');
    if (rule.searchable !== undefined && typeof rule.searchable !== 'boolean')
      throw new Error('查询配置不正确');
    return {
      fieldKey: rule.field,
      label: rule.title,
      type,
      required:
        rule.$required === true ||
        (typeof rule.$required === 'string' && rule.$required.length > 0),
      defaultValue: (rule.value ?? null) as FieldValue,
      options: ['multiselect', 'select'].includes(type)
        ? (rule.options as FormField['options'])
        : [],
      help: rule.info || '',
      maxLength: ['text', 'textarea'].includes(type)
        ? Number(
            props.maxlength ??
              old?.maxLength ??
              (type === 'textarea' ? 5000 : 200),
          )
        : (old?.maxLength ?? 200),
      min: type === 'number' ? numericBound(props.min) : null,
      max: type === 'number' ? numericBound(props.max) : null,
      listVisible: (rule.listVisible as boolean) ?? old?.listVisible ?? true,
      searchable:
        type === 'multiselect'
          ? false
          : ((rule.searchable as boolean) ?? old?.searchable ?? false),
    };
  });
  const schema = { fields };
  const error = schemaError(schema);
  if (error) throw new Error(error);
  return structuredClone(schema);
}
