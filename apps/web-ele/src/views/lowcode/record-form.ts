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
    formItemClass: {
      6: 'col-span-12 md:col-span-3',
      8: 'col-span-12 md:col-span-4',
      12: 'col-span-12 md:col-span-6',
      24: 'col-span-12',
    }[field.ui?.span ?? 24],
    componentProps: {
      ...fieldControl(field).componentProps,
      ...(field.ui
        ? {
            placeholder: field.ui.placeholder,
            clearable: field.ui.clearable,
            readonly: field.ui.readOnly,
            disabled: field.ui.disabled,
            showWordLimit: field.ui.showWordLimit,
          }
        : {}),
    },
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
    case 'checkbox':
    case 'radio': {
      return {
        component: field.type === 'radio' ? 'RadioGroup' : 'CheckboxGroup',
        componentProps: { options: field.options },
      };
    }
    case 'color': {
      return {
        component: 'ColorPicker',
        componentProps: { colorFormat: 'hex', showAlpha: false },
      };
    }
    case 'date':
    case 'daterange': {
      return {
        component: 'DatePicker',
        componentProps: {
          type: field.type,
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
    case 'rate': {
      return { component: 'Rate', componentProps: { max: 5, allowHalf: true } };
    }
    case 'slider': {
      return {
        component: 'Slider',
        componentProps: { min: field.min ?? 0, max: field.max ?? 100 },
      };
    }
    case 'switch': {
      return { component: 'Switch' };
    }
    case 'time':
    case 'timerange': {
      return {
        component: 'TimePicker',
        componentProps: {
          isRange: field.type === 'timerange',
          valueFormat: 'HH:mm:ss',
          clearable: true,
        },
      };
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
