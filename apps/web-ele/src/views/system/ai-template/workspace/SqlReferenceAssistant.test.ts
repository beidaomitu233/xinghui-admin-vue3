import type {
  AuthorizedSchema,
  QueryResult,
  SqlQuery,
} from '#/api/system/ai-query';

import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

import ElementPlus, { ElMessageBox } from 'element-plus';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  click,
  fill,
  selectControl,
  selectValue,
  settleDebounce,
} from '#/test-utils/element-controls';

import SqlReferenceAssistant from './SqlReferenceAssistant.vue';

const rawAccess = vi.hoisted(() => ({
  accessToken: 'actor-a',
  accessCodes: ['ai:scene:query', 'ai:scene:edit'],
}));
const store = reactive(rawAccess);
const api = vi.hoisted(() => ({
  schema: vi.fn(),
  catalog: vi.fn(),
  validate: vi.fn(),
  preview: vi.fn(),
  start: vi.fn(),
  poll: vi.fn(),
  cancel: vi.fn(),
  save: vi.fn(),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => store }));
vi.mock('#/api/request', () => ({
  requestClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('#/api/system/ai-query', async (original) => ({
  ...(await original<object>()),
  getQuerySchema: api.schema,
  getQueryCatalog: api.catalog,
  validateQuery: api.validate,
  previewQuery: api.preview,
}));
vi.mock('#/api/system/ai-sql-assistance', () => ({
  startSqlAssistance: api.start,
  getSqlAssistance: api.poll,
  cancelSqlAssistance: api.cancel,
}));
const authorized: AuthorizedSchema = {
  datasets: [
    {
      datasetKey: 'orders',
      sqlName: 'orders_view',
      label: '销售订单',
      description: '可读订单金额',
      scope: 'TENANT',
      scopeDescription: '当前租户内的可读订单',
      columns: [
        { name: 'amount', label: '订单金额', type: 'DECIMAL', nullable: true },
      ],
      schemaFingerprint: 'orders-a',
    },
  ],
  supportedSyntax: ['SELECT'],
  trustedParameters: ['current_user_id'],
  scopeDescription: '当前租户内的授权数据',
  fingerprint: 'schema-a',
};
const query: SqlQuery = {
  sql: 'SELECT amount FROM orders_view',
  parameters: {},
  maxRows: 20,
};
const result: QueryResult = {
  columns: [
    { name: 'amount', label: '订单金额', type: 'BIGINT', nullable: true },
  ],
  rows: [{ amount: '9007199254740993' }, { amount: null }],
  rowCount: 2,
  truncated: true,
  notices: [],
};
const wrappers: ReturnType<typeof mount>[] = [];
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { resolve, promise };
}
async function render(readonly = false) {
  const wrapper = mount(SqlReferenceAssistant, {
    attachTo: document.body,
    props: {
      open: true,
      readonly,
      sceneKey: 'scene.a',
      revision: 4,
      configured: true,
      usedVariables: ['user_request'],
      saveBinding: api.save,
    },
    global: { plugins: [ElementPlus] },
  });
  wrappers.push(wrapper);
  await flushPromises();
  await flushPromises();
  return wrapper;
}
async function manualQuery() {
  await click('手工编写 SQL');
  await fill('只读 SQL', query.sql);
}
async function generate() {
  await fill('描述要取的数据', '读取订单金额');
  await click('生成 SQL');
}
beforeEach(() => {
  vi.resetAllMocks();
  store.accessToken = 'actor-a';
  store.accessCodes = ['ai:scene:query', 'ai:scene:edit'];
  api.schema.mockResolvedValue(authorized);
  api.catalog.mockResolvedValue({
    records: authorized.datasets,
    total: '1',
    pageNum: 1,
    pageSize: 20,
  });
  api.validate.mockResolvedValue({
    currentRecordDatasetKey: null,
    valid: true,
    normalizedSql: query.sql,
    columns: result.columns,
    diagnostics: [],
    schemaFingerprint: 'schema-a',
  });
  api.preview.mockResolvedValue(result);
  api.start.mockResolvedValue({
    requestId: '9007199254740994',
    status: 'QUEUED',
    scopeDescription: authorized.scopeDescription,
    schemaFingerprint: 'schema-a',
  });
  api.poll.mockResolvedValue({
    requestId: '9007199254740994',
    status: 'SUCCEEDED',
    query,
    scopeDescription: authorized.scopeDescription,
    schemaFingerprint: 'schema-a',
    diagnostics: [],
    errorCode: null,
    deadline: '2099-01-01T00:00:00Z',
  });
  api.cancel.mockResolvedValue({});
  api.save.mockResolvedValue(true);
  vi.spyOn(ElMessageBox, 'confirm').mockImplementation(
    vi.fn().mockResolvedValue('confirm'),
  );
});
afterEach(async () => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  await flushPromises();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
describe('bounded SQL reference assistant', () => {
  it('uses a searchable paginated range selector even when the default schema is too large', async () => {
    api.schema.mockRejectedValueOnce({ response: { status: 413 } });
    const wrapper = await render();
    expect(api.catalog).toHaveBeenCalledWith({
      keyword: undefined,
      pageNum: 1,
      pageSize: 20,
    });
    await selectValue(wrapper, '缩小查询数据范围', ['orders']);
    expect(api.schema).toHaveBeenLastCalledWith({
      datasetKeys: ['orders'],
      businessRef: null,
    });
    const remote = selectControl(wrapper, '缩小查询数据范围').props(
      'remoteMethod',
    );
    if (!remote) throw new Error('Missing range search');
    remote('订单');
    await settleDebounce();
    expect(api.catalog).toHaveBeenLastCalledWith({
      keyword: '订单',
      pageNum: 1,
      pageSize: 20,
    });
    expect(
      selectControl(wrapper, '缩小查询数据范围').props('modelValue'),
    ).toEqual(['orders']);
    expect(api.preview).not.toHaveBeenCalled();
  });
  it('statically saves a dynamic record query without pretending that database rows were read', async () => {
    api.validate.mockResolvedValue({
      valid: true,
      normalizedSql: query.sql,
      columns: result.columns,
      diagnostics: [],
      schemaFingerprint: 'schema-a',
      currentRecordDatasetKey: 'orders',
    });
    await render();
    await manualQuery();
    await click('只读试查');
    expect(api.preview).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('尚未取数');
    await fill('查询引用名称', '本次订单');
    await click('保存并插入提示词');
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ label: '本次订单', query }),
    );
    expect(api.preview).not.toHaveBeenCalled();
    expect(api.start).not.toHaveBeenCalled();
  });
  it('uses server scope and starts the model only on the explicit generation action', async () => {
    await render();
    expect(api.schema).toHaveBeenCalledWith({
      datasetKeys: [],
      businessRef: null,
    });
    expect(document.body.textContent).toContain(authorized.scopeDescription);
    expect(api.start).not.toHaveBeenCalled();
    expect(api.preview).not.toHaveBeenCalled();
    await generate();
    expect(api.start).toHaveBeenCalledWith({
      sceneKey: 'scene.a',
      expectedSceneRevision: 4,
      description: '读取订单金额',
      datasetKeys: [],
      businessRef: null,
      initialModel: null,
      expectedSchemaFingerprint: 'schema-a',
      confirmedCosts: true,
      clientMutationId: expect.any(String),
      maxRows: 20,
    });
    expect(
      (
        document.querySelector(
          'textarea[aria-label="只读 SQL"]',
        ) as HTMLTextAreaElement
      ).value,
    ).toBe(query.sql);
    expect(api.poll).toHaveBeenCalledWith('9007199254740994');
    expect(api.preview).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
  });
  it('supports manual SQL without a model call and saves exact typed values only after a matching read-only trial', async () => {
    await render();
    await manualQuery();
    await click('只读试查');
    expect(api.validate).toHaveBeenCalledWith({
      datasetKeys: [],
      businessRef: null,
      query,
    });
    expect(api.preview).toHaveBeenCalledWith({
      datasetKeys: [],
      businessRef: null,
      query,
    });
    expect(document.body.textContent).toContain('9007199254740993');
    expect(document.body.textContent).toContain('null');
    expect(document.body.textContent).toContain('已截断');
    await fill('查询引用名称', '订单金额');
    await click('保存并插入提示词');
    expect(api.save).toHaveBeenCalledWith({
      variable: 'query_data',
      label: '订单金额',
      description: '',
      datasetKeys: [],
      query,
    });
    expect(api.start).not.toHaveBeenCalled();
  });
  it('does not execute SQL rejected by validation and does not accept forged reserved parameters', async () => {
    api.validate.mockResolvedValueOnce({
      valid: false,
      normalizedSql: '',
      columns: [],
      diagnostics: [{ path: 'sql', code: 'FIELD_FORBIDDEN' }],
      schemaFingerprint: 'schema-a',
    });
    await render();
    await manualQuery();
    await click('只读试查');
    expect(api.preview).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('不可读字段');
    await fill('SQL 业务参数', '{"current_user_id":"other-actor"}');
    await click('只读试查');
    expect(api.validate).toHaveBeenCalledTimes(1);
    expect(api.preview).not.toHaveBeenCalled();
  });
  it('invalidates a late validation response when SQL changes instead of executing or saving the old text', async () => {
    const delayed = deferred<unknown>();
    api.validate.mockReturnValueOnce(delayed.promise);
    await render();
    await manualQuery();
    await click('只读试查');
    await fill(
      '只读 SQL',
      'SELECT amount FROM orders_view WHERE amount > :amount',
    );
    delayed.resolve({
      valid: true,
      normalizedSql: query.sql,
      columns: result.columns,
      diagnostics: [],
      schemaFingerprint: 'schema-a',
    });
    await flushPromises();
    expect(api.preview).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
  });
  it('retries uncertain generation admission with its frozen nonce and request body', async () => {
    api.start.mockRejectedValueOnce(new Error('lost admission'));
    await render();
    await generate();
    const original = api.start.mock.calls[0]?.[0];
    expect(document.body.textContent).toContain('受理未确认');
    await manualQuery();
    const edited = 'SELECT amount FROM orders_view WHERE amount > :minimum';
    await fill('只读 SQL', edited);
    await click('重试原生成请求');
    expect(api.start.mock.calls[1]?.[0]).toEqual(original);
    expect(api.start).toHaveBeenCalledTimes(2);
    expect(
      document.querySelector<HTMLTextAreaElement>('[aria-label="只读 SQL"]')
        ?.value,
    ).toBe(edited);
  });
  it('cancels the original generated request and confirms the terminal state by polling without trial execution', async () => {
    api.poll
      .mockResolvedValueOnce({
        requestId: '9007199254740994',
        status: 'RUNNING',
        query: null,
        scopeDescription: authorized.scopeDescription,
        schemaFingerprint: 'schema-a',
        diagnostics: [],
        errorCode: null,
        deadline: '2099-01-01T00:00:00Z',
      })
      .mockResolvedValueOnce({
        requestId: '9007199254740994',
        status: 'CANCELLED',
        query: null,
        scopeDescription: authorized.scopeDescription,
        schemaFingerprint: 'schema-a',
        diagnostics: [],
        errorCode: null,
        deadline: '2099-01-01T00:00:00Z',
      });
    await render();
    await generate();
    await click('取消生成');
    expect(api.cancel).toHaveBeenCalledWith('9007199254740994');
    expect(document.body.textContent).toContain('已取消生成');
    expect(api.preview).not.toHaveBeenCalled();
  });
  it('clears query results on identity change and discards old actor preview values', async () => {
    const delayed = deferred<QueryResult>();
    api.preview.mockReturnValueOnce(delayed.promise);
    const wrapper = await render();
    await manualQuery();
    await click('只读试查');
    store.accessToken = 'actor-b';
    await flushPromises();
    delayed.resolve({
      ...result,
      rows: [{ amount: 'OLD_ACTOR_PRIVATE_VALUE' }],
    });
    await flushPromises();
    expect(document.body.textContent).not.toContain('OLD_ACTOR_PRIVATE_VALUE');
    expect(wrapper.emitted('update:open')).toContainEqual([false]);
    expect(api.save).not.toHaveBeenCalled();
  });
  it('keeps readonly presentation free of schema, provider and database requests', async () => {
    await render(true);
    expect(api.catalog).not.toHaveBeenCalled();
    expect(api.schema).not.toHaveBeenCalled();
    expect(api.start).not.toHaveBeenCalled();
    expect(api.preview).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
  });
});
