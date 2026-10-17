import { flushPromises, mount } from '@vue/test-utils';

import { ElCollapse } from 'element-plus';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { radioValue, selectValue } from '#/test-utils/element-controls';

import DatabaseBindingEditor from './DatabaseBindingEditor.vue';
import DatabaseRecordPicker from './DatabaseRecordPicker.vue';

const api = vi.hoisted(() => ({
  tables: vi.fn(),
  fields: vi.fn(),
  relations: vi.fn(),
  preview: vi.fn(),
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({ accessCodes: ['ai:data:database:read'] }),
}));
vi.mock('#/api/system/ai-database', () => ({
  databaseTables: api.tables,
  databaseFields: api.fields,
  databaseRelations: api.relations,
  previewBindings: api.preview,
}));
vi.mock('./DatabaseRecordPicker.vue', () => ({
  default: { template: '<div>有权记录选择器</div>' },
}));
vi.mock('./SceneFormPicker.vue', () => ({
  default: { template: '<div>表单名称选择器</div>' },
}));
const binding = {
  variable: '订单',
  label: '当前订单',
  sourceKey: 'db.orders',
  mode: 'ROW' as const,
  fields: [],
  filters: [],
  limit: 1,
  row: { currentRecord: false, key: { id: 42 } },
  relation: null,
};
const render = (
  value = [] as (typeof binding)[],
  preparePreview?: () => Promise<(typeof binding)[]>,
) =>
  mount(DatabaseBindingEditor, {
    props: { value, readonly: false, preparePreview },
  });
const click = async (wrapper: ReturnType<typeof render>, text: string) => {
  const button = wrapper.findAll('button').find((item) => item.text() === text);
  if (!button) throw new Error(`Missing ${text}`);
  await button.trigger('click');
  await flushPromises();
};
beforeEach(() => {
  vi.clearAllMocks();
  api.tables.mockResolvedValue({
    records: [
      {
        sourceKey: 'db.orders',
        tableName: 'orders',
        label: '订单',
        comment: '销售订单',
        primaryKey: ['id'],
      },
      {
        sourceKey: 'db.lines',
        tableName: 'lines',
        label: '订单明细',
        primaryKey: ['id'],
      },
    ],
    total: '2',
  });
  api.fields.mockImplementation(async (source: string) => ({
    sourceKey: source,
    primaryKey: ['id'],
    fields: [
      { field: 'id', label: '编号', type: 'integer', primaryKey: true },
      {
        field: source === 'db.lines' ? 'order_id' : 'amount',
        label: '金额或订单',
        type: 'integer',
        nullable: true,
      },
    ],
  }));
  api.relations.mockResolvedValue([
    {
      name: 'orders_lines',
      parentSourceKey: 'db.orders',
      parentField: 'id',
      childSourceKey: 'db.lines',
      childField: 'order_id',
      foreignKey: true,
    },
  ]);
});
describe('actual database bindings', () => {
  it('clears table filters when switching to an exact row and keeps a valid Unicode alias', async () => {
    const wrapper = render();
    await flushPromises();
    await click(wrapper, '添加引用');
    await selectValue(wrapper, '业务表', 'db.orders');
    await radioValue(wrapper, '取数方式', 'TABLE');
    wrapper.getComponent(ElCollapse).vm.$emit('update:modelValue', ['filters']);
    await flushPromises();
    await click(wrapper, '增加条件');
    await wrapper.get('input[aria-label="筛选值"]').setValue('42');
    await radioValue(wrapper, '取数方式', 'ROW');
    expect(wrapper.findComponent(ElCollapse).exists()).toBe(false);
    wrapper.getComponent(DatabaseRecordPicker).vm.$emit('update:modelValue', {
      key: { id: '19' },
      label: '订单十九',
      values: {},
      businessRef: null,
    });
    await flushPromises();
    await wrapper.get('input[aria-label="引用名称"]').setValue('2026.订单');
    await click(wrapper, '保存并插入提示词');
    const saved = wrapper.emitted('change')?.at(-1)?.[0] as {
      filters: unknown[];
      variable: string;
    }[];
    expect(saved[0]?.filters).toEqual([]);
    expect(saved[0]?.variable).toMatch(/^[\p{L}_][\p{L}\p{N}_.]{0,63}$/u);
    expect(saved[0]?.variable).not.toBe('user_request');
    wrapper.unmount();
  });
  it('preserves the exact server key when fixing a record with a nineteen digit ID', async () => {
    const wrapper = render();
    await flushPromises();
    await click(wrapper, '添加引用');
    await selectValue(wrapper, '业务表', 'db.orders');
    await flushPromises();
    await selectValue(wrapper, '引用字段', ['id']);
    wrapper.getComponent(DatabaseRecordPicker).vm.$emit('update:modelValue', {
      key: { id: '2026101801234567890' },
      label: '十月订单',
      values: {},
      businessRef: { type: 'database.record', id: 'opaque-server-token' },
    });
    await flushPromises();
    await click(wrapper, '保存并插入提示词');
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual([
      expect.objectContaining({
        row: { currentRecord: false, key: { id: '2026101801234567890' } },
      }),
    ]);
    wrapper.unmount();
  });
  it('saves whole-table bindings with typed numeric AND filters and an explicit row limit', async () => {
    const wrapper = render();
    await flushPromises();
    await click(wrapper, '添加引用');
    await selectValue(wrapper, '业务表', 'db.orders');
    await flushPromises();
    await radioValue(wrapper, '取数方式', 'TABLE');
    wrapper.getComponent(ElCollapse).vm.$emit('update:modelValue', ['filters']);
    await flushPromises();
    await click(wrapper, '增加条件');
    await wrapper.get('input[aria-label="筛选值"]').setValue('42');
    await wrapper.get('input[aria-label="最多取数行数"]').setValue('35');
    await click(wrapper, '保存并插入提示词');
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual([
      expect.objectContaining({
        mode: 'TABLE',
        fields: [],
        limit: 35,
        row: null,
        filters: [{ field: 'id', operator: 'EQ', value: 42 }],
      }),
    ]);
    expect(api.preview).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('binds children to a preceding parent row through actual selected relation fields', async () => {
    const wrapper = render([binding]);
    await flushPromises();
    await click(wrapper, '添加引用');
    await selectValue(wrapper, '业务表', 'db.lines');
    await flushPromises();
    await radioValue(wrapper, '取数方式', 'CHILDREN');
    await selectValue(wrapper, '主记录引用', '订单');
    await flushPromises();
    await selectValue(wrapper, '数据库关联', '0');
    await click(wrapper, '保存并插入提示词');
    expect(wrapper.emitted('change')?.[0]?.[0]).toEqual([
      binding,
      expect.objectContaining({
        mode: 'CHILDREN',
        sourceKey: 'db.lines',
        relation: {
          parentVariable: '订单',
          parentField: 'id',
          childField: 'order_id',
        },
      }),
    ]);
    wrapper.unmount();
  });
  it('previews only confirmed bindings and renders real values, null and truncation', async () => {
    const prepare = vi.fn(async () => [binding]);
    api.preview.mockResolvedValue({
      values: { 订单: { amount: null, items: [1, false, '真实订单名称'] } },
      reads: [
        {
          variable: '订单',
          sourceKey: 'db.orders',
          rowCount: 1,
          truncated: true,
        },
      ],
      notices: [],
    });
    const wrapper = render([binding], prepare);
    await flushPromises();
    await click(wrapper, '预览实际数据');
    expect(prepare).toHaveBeenCalledOnce();
    expect(api.preview).toHaveBeenCalledWith({
      bindings: [binding],
      businessRef: null,
    });
    expect(wrapper.text()).toContain('真实订单名称');
    expect(wrapper.text()).toContain('null');
    expect(wrapper.text()).toContain('截断');
    wrapper.unmount();
  });
});
