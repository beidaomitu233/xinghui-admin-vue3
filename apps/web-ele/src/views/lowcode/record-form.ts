import type { VbenFormSchema } from '#/adapter/form';
import type { FieldValue, FormField, FormSchema } from '#/api/lowcode/forms';

import { z } from '#/adapter/form';

import { dataError } from './form-schema';

/** Business schema mapping only; all controls, validation display and layout come from Vben Form. */
export function recordFormSchema(schema: FormSchema): VbenFormSchema[] {
  return schema.fields.map((field) => ({
    ...fieldControl(field),
    fieldName: field.fieldKey,
    label: field.label,
    description: field.help || undefined,
    rules: z
      .any()
      .superRefine((value, context) => {
        const message = dataError(
          { fields: [field] },
          { [field.fieldKey]: value as FieldValue },
        );
        if (message) context.addIssue({ code: z.ZodIssueCode.custom, message });
      })
      .default(null),
  }));
}

export function fieldControl(
  field: FormField,
): Pick<VbenFormSchema, 'component' | 'componentProps'> {
  switch (field.type) {
    case 'date': {
      return {
        component: 'DatePicker',
        componentProps: {
          type: 'date',
          valueFormat: 'YYYY-MM-DD',
          clearable: true,
        },
      };
    }
    case 'multiselect':
    case 'select': {
      return {
        component: 'Select',
        componentProps: {
          options: field.options,
          multiple: field.type === 'multiselect',
          clearable: true,
          filterable: true,
        },
      };
    }
    case 'number': {
      return {
        component: 'InputNumber',
        componentProps: {
          min: field.min ?? -1e12,
          max: field.max ?? 1e12,
          precision: 6,
          controlsPosition: 'right',
        },
      };
    }
    case 'switch': {
      return { component: 'Switch' };
    }
    default: {
      return {
        component: 'Input',
        componentProps: {
          type: field.type === 'textarea' ? 'textarea' : 'text',
          rows: 3,
          maxlength: field.maxLength,
          showWordLimit: true,
        },
      };
    }
  }
}

export function safeGridTotal(value: number | string): number {
  const total = Number(value);
  if (
    (typeof value === 'string' && !/^\d+$/u.test(value)) ||
    !Number.isSafeInteger(total) ||
    total < 0
  )
    throw new Error('列表总数格式不正确');
  return total;
}
