import { flushPromises, mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { click, fill, selectValue } from '#/test-utils/element-controls';

import DatabaseRecordPicker from './DatabaseRecordPicker.vue';

const api = vi.hoisted(() => ({ fields: vi.fn(), records: vi.fn() }));
vi.mock('#/api/system/ai-database', () => ({
  databaseFields: api.fields,
  databaseRecords: api.records,
}));
beforeEach(() => {
  vi.clearAllMocks();
  api.fields.mockResolvedValue({
    fields: [
      { field: 'id', label: '订单编号', type: 'bigint' },
      { field: 'amount', label: '精确金额', type: 'decimal' },
    ],
    primaryKey: ['id'],
  });
  api.records.mockResolvedValue({
    records: [
      {
        key: { id: '2026101801234567890' },
        label: '十月订单',
        values: {},
        businessRef: { type: 'database.record', id: 'opaque-token' },
      },
    ],
    truncated: false,
  });
});
describe('exact record selection', () => {
  it.each([
    ['id', '2026101801234567890'],
    ['amount', '12345678901234567890.123456789'],
  ])('preserves %s searches without numeric rounding', async (field, value) => {
    const wrapper = mount(DatabaseRecordPicker, {
      attachTo: document.body,
      props: { sourceKey: 'db.orders', modelValue: null },
    });
    await flushPromises();
    await wrapper.get('button[aria-label="筛选业务记录"]').trigger('click');
    await flushPromises();
    await selectValue(wrapper, '记录搜索字段', field);
    await fill('记录搜索值', value);
    await click('搜索记录');
    await flushPromises();
    expect(api.records).toHaveBeenLastCalledWith({
      sourceKey: 'db.orders',
      filters: [{ field, operator: 'EQ', value }],
      limit: 20,
    });
    await selectValue(wrapper, '业务记录', '0');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({
      key: { id: '2026101801234567890' },
      businessRef: { id: 'opaque-token' },
    });
    wrapper.unmount();
  });
});
