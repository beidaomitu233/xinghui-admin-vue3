import type { DataBinding } from '#/api/system/ai-database';

import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DataReferenceTable from './DataReferenceTable.vue';

const rawAccess = vi.hoisted(() => ({
  accessToken: 'actor-a',
  accessCodes: ['ai:data:database:read'],
}));
const store = reactive(rawAccess);
const api = vi.hoisted(() => ({
  fields: vi.fn(),
  tables: vi.fn(),
  legacy: vi.fn(),
  schema: vi.fn(),
  validate: vi.fn(),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => store }));
vi.mock('#/api/system/ai-database', () => ({
  databaseFields: api.fields,
  databaseTables: api.tables,
}));
vi.mock('#/api/system/ai-scene-data', () => ({ sceneDataFields: api.legacy }));
vi.mock('#/api/system/ai-query', () => ({
  getQuerySchema: api.schema,
  validateQuery: api.validate,
}));
const wrappers: ReturnType<typeof mount>[] = [];
function binding(variable = 'customer'): DataBinding {
  return {
    variable,
    label: '客户资料',
    sourceKey: 'db.customers',
    mode: 'FIELD',
    fields: ['customer_name'],
    filters: [],
    limit: 1,
    row: { currentRecord: false, key: { id: '19' } },
    relation: null,
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  store.accessToken = 'actor-a';
  store.accessCodes = ['ai:data:database:read'];
  api.fields.mockResolvedValue({
    fields: [
      { field: 'customer_name', label: '客户名称', comment: '客户名称' },
    ],
  });
  api.tables.mockResolvedValue({
    records: [
      {
        sourceKey: 'db.customers',
        tableName: 'customers',
        label: '客户资料',
        comment: '客户资料',
      },
    ],
  });
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
});
describe('readable data reference descriptions', () => {
  it('shows builtin input and readable field/source labels with a per-source metadata cache', async () => {
    const wrapper = mount(DataReferenceTable, {
      props: {
        bindings: [binding(), binding('customer_backup')],
        legacyObjects: [],
        readonly: false,
      },
    });
    wrappers.push(wrapper);
    await flushPromises();
    expect(wrapper.text()).toContain('用户要求');
    expect(wrapper.text()).toContain('调用时由用户输入');
    expect(wrapper.text()).toContain('客户名称');
    expect(wrapper.text()).not.toContain('customer_name');
    expect(wrapper.text()).not.toContain('db.customers');
    expect(api.fields).toHaveBeenCalledTimes(1);
    expect(api.tables).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('{{customer:客户资料}}');
    await wrapper.setProps({ bindings: [binding('updated_alias')] });
    await flushPromises();
    expect(api.fields).toHaveBeenCalledTimes(1);
  });
  it('retains legacy Chinese tokens and signals missing metadata rather than guessing field descriptions', async () => {
    api.fields.mockRejectedValueOnce(new Error('denied'));
    const wrapper = mount(DataReferenceTable, {
      props: {
        bindings: [binding('旧客户')],
        legacyObjects: [],
        readonly: false,
      },
    });
    wrappers.push(wrapper);
    await flushPromises();
    expect(wrapper.text()).toContain('{{旧客户}}');
    expect(wrapper.text()).not.toContain('{{旧客户:');
    expect(wrapper.text()).toContain('字段说明未读取');
    expect(wrapper.emitted('remove')).toBeUndefined();
  });
  it('keeps readonly demo descriptions free of database metadata and query requests', async () => {
    const wrapper = mount(DataReferenceTable, {
      props: {
        bindings: [binding()],
        legacyObjects: [],
        readonly: true,
        sqlBindings: [
          {
            variable: 'summary',
            label: '汇总',
            description: '虚构只读说明',
            datasetKeys: [],
            query: {
              sql: 'SELECT amount FROM fictional_orders',
              parameters: {},
              maxRows: 20,
            },
          },
        ],
      },
    });
    wrappers.push(wrapper);
    await flushPromises();
    expect(wrapper.text()).toContain('虚构只读说明');
    expect(api.fields).not.toHaveBeenCalled();
    expect(api.tables).not.toHaveBeenCalled();
    expect(api.schema).not.toHaveBeenCalled();
    expect(api.validate).not.toHaveBeenCalled();
  });
});
