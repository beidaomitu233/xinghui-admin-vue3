import type { FormSchema } from '#/api/lowcode/forms';

import { describe, expect, it } from 'vitest';

import { fieldTypes, newField } from '../form-schema';
import { designerToSchema, schemaToDesigner } from './designer-schema';

function at<T>(values: readonly T[] | undefined, index: number): T {
  const value = values?.[index];
  if (value === undefined) throw new Error('Missing fixture item');
  return value;
}
function example(): FormSchema {
  return {
    fields: fieldTypes.map(({ value: type }, index) => {
      const field = newField(index + 1);
      field.type = type;
      field.label = `中文字段 ${index}`;
      field.help = '填写帮助';
      field.required = index % 2 === 0;
      field.listVisible = index % 2 !== 0;
      field.searchable = type !== 'multiselect';
      if (type === 'textarea') field.maxLength = 5000;
      if (type === 'number') {
        field.defaultValue = -0.000_001;
        field.min = -9.123_456;
        field.max = 0;
      }
      if (type === 'date') field.defaultValue = '2024-02-29';
      if (type === 'switch') field.defaultValue = false;
      if (['multiselect', 'select'].includes(type)) {
        field.options = [
          { label: '甲', value: 'a' },
          { label: '乙', value: 'b' },
        ];
        field.defaultValue = type === 'select' ? 'b' : [];
      }
      return field;
    }),
  };
}
describe('native designer business schema boundary', () => {
  it('round trips seven types and preserves source, keys, metadata, precise values and string options', () => {
    const original = example();
    const snapshot = structuredClone(original);
    const rules = schemaToDesigner(original);
    expect(designerToSchema(rules, original)).toEqual(original);
    at(rules, 0).title = '修改标题';
    at(at(rules, 4).options, 0).label = '新选项';
    const edited = designerToSchema(rules, original);
    expect(edited.fields.map((field) => field.fieldKey)).toEqual(
      original.fields.map((field) => field.fieldKey),
    );
    expect(at(at(edited.fields, 4).options, 0).label).toBe('新选项');
    expect(original).toEqual(snapshot);
  });
  it('preserves zero, false and empty selections after native optional-value cleanup', () => {
    const original = example();
    at(original.fields, 2).defaultValue = 0;
    // JSON round-trip exercises the library's serialized export boundary.
    // eslint-disable-next-line unicorn/prefer-structured-clone -- Validate serialization, not cloning.
    const rules = JSON.parse(
      JSON.stringify(schemaToDesigner(original)),
    ) as Record<string, unknown>[];
    delete at(rules, 0).value;
    const fields = designerToSchema(rules, original).fields;
    expect(at(fields, 0).defaultValue).toBeNull();
    expect(at(fields, 2).defaultValue).toBe(0);
    expect(at(fields, 5).defaultValue).toEqual([]);
    expect(at(fields, 6).defaultValue).toBe(false);
  });
  it.each([
    { children: [{ type: 'input', field: 'nested' }] },
    { on: { change: 'execute()' } },
    { computed: { value: 'execute()' } },
    { props: { remote: true } },
    { props: { formatter: () => 'execute' } },
    { type: 'html', children: ['<script>execute()</script>'] },
    { field: 'BAD_KEY' },
    { hidden: true },
    { display: false },
    { type: 'select', options: [{ label: '对象值', value: { id: 1 } }] },
  ])('rejects incompatible native rules: %j', (patch) => {
    const original = example();
    const rules = schemaToDesigner(original);
    Object.assign(at(rules, 0), patch);
    expect(() => designerToSchema(rules, original)).toThrow();
  });
  it('rejects duplicate keys and invalid numeric precision before saving', () => {
    const original = example();
    const rules = schemaToDesigner(original);
    at(rules, 1).field = at(rules, 0).field;
    expect(() => designerToSchema(rules, original)).toThrow('字段标识');
    at(rules, 1).field = 'field_2';
    at(rules, 2).value = 0.123_456_7;
    expect(() => designerToSchema(rules, original)).toThrow('范围');
  });
});
