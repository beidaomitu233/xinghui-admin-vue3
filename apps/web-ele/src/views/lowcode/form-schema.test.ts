import { describe, expect, it } from 'vitest';

import { dataError, initialData, newField, schemaError } from './form-schema';

describe('lowcode schema contract', () => {
  it('supports dictionary values 0 and 1, but rejects unknown choices', () => {
    const field = {
      ...newField(1),
      type: 'select' as const,
      required: true,
      options: [
        { label: '否', value: '0' },
        { label: '是', value: '1' },
      ],
      defaultValue: '0',
    };
    const schema = { fields: [field] };
    expect(schemaError(schema)).toBeUndefined();
    expect(initialData(schema)).toEqual({ field_1: '0' });
    expect(dataError(schema, { field_1: '1' })).toBeUndefined();
    expect(dataError(schema, { field_1: '2' })).toBeDefined();
  });
  it('rejects reserved and duplicate fields and an undefined record property', () => {
    const field = newField(1);
    expect(
      schemaError({ fields: [{ ...field, fieldKey: 'tenant_id' }] }),
    ).toBeDefined();
    expect(schemaError({ fields: [field, field] })).toBeDefined();
    expect(
      dataError({ fields: [field] }, { field_1: 'text', revision: 1 }),
    ).toBeDefined();
  });
  it('validates required text, numbers, real dates, multiselects and boolean switches', () => {
    expect(
      dataError(
        { fields: [{ ...newField(1), required: true }] },
        { field_1: ' ' },
      ),
    ).toBeDefined();
    const fields = [
      { ...newField(1), type: 'number' as const, min: 0, max: 10 },
      { ...newField(2), type: 'date' as const },
      {
        ...newField(3),
        type: 'multiselect' as const,
        options: [{ label: '选项', value: '1' }],
      },
      { ...newField(4), type: 'switch' as const },
    ];
    const schema = { fields };
    const data = {
      field_1: 2.5,
      field_2: '2026-10-12',
      field_3: ['1'],
      field_4: false,
    };
    expect(dataError(schema, data)).toBeUndefined();
    expect(dataError(schema, { ...data, field_1: 11 })).toBeDefined();
    expect(dataError(schema, { ...data, field_2: '2026-02-30' })).toBeDefined();
    expect(dataError(schema, { ...data, field_3: ['1', '1'] })).toBeDefined();
    expect(dataError(schema, { ...data, field_4: 'false' })).toBeDefined();
  });
  it('enforces field limits and treats script-shaped content as ordinary text', () => {
    const field = newField(1);
    expect(
      schemaError({
        fields: Array.from({ length: 101 }, (_, index) => newField(index + 1)),
      }),
    ).toBeDefined();
    expect(
      dataError({ fields: [field] }, { field_1: 'x'.repeat(201) }),
    ).toBeDefined();
    expect(
      dataError(
        { fields: [field] },
        { field_1: '<script>window.test=1</script>' },
      ),
    ).toBeUndefined();
  });
});
