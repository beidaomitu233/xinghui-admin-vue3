import type { AiPage } from '#/api/system/ai-application';
import type {
  CallLogRow,
  CallLogDetail as Detail,
} from '#/api/system/ai-call-log';

import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';

import ElementPlus, { ElSelectV2 } from 'element-plus';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { initComponentAdapter } from '#/adapter/component';
import { initSetupVbenForm } from '#/adapter/form';
import { fictionalCall } from '#/demo/ai-call-logs';

import {
  exact,
  outputTime,
  responseText,
  structuredRows,
  tokenValue,
} from './call-log-format';
import CallLogDetail from './CallLogDetail.vue';
import CallLogPanel from './CallLogPanel.vue';

const state = vi.hoisted(() => ({
  access: { accessToken: '', accessCodes: [] as string[] },
}));
const api = vi.hoisted(() => ({
  list: vi.fn(),
  stats: vi.fn(),
  detail: vi.fn(),
  export: vi.fn(),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => state.access }));
vi.mock('#/api/system/ai-call-log', () => ({
  listCallLogs: api.list,
  callLogStatistics: api.stats,
  getCallLog: api.detail,
  exportCallLogs: api.export,
}));
const row = {
  ...fictionalCall,
  callId: 'test-call',
  requestId: 'request-one',
  modelCode: '测试模型',
  inputTokens: '9007199254740993123',
  outputTokens: '0',
  reportedCost: '0.0000000000000000123',
  currency: 'USD',
  responseAvailable: true,
};
const response = {
  format: 'SSE' as const,
  body: 'data: private response\n\ndata: [DONE]',
  headers: {},
  usage: {},
  receivedBytes: '90',
  archivedBytes: '90',
};
const counts = {
  calls: '9007199254740993123',
  succeeded: '0',
  failed: '1',
  knownInputTokens: null,
  knownOutputTokens: '0',
  unknownInputCalls: '1',
  unknownOutputCalls: '0',
};
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred not initialized');
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function click(wrapper: ReturnType<typeof mount>, text: string) {
  const target = wrapper
    .findAll('button')
    .find((button) => button.text() === text);
  if (!target) throw new Error(`Missing button ${text}`);
  await (target.attributes('type') === 'submit'
    ? wrapper.get('form').trigger('submit')
    : target.trigger('click'));
  await flushPromises();
}
beforeAll(async () => {
  await initComponentAdapter();
  await initSetupVbenForm();
});
const panels: ReturnType<typeof mount>[] = [];
function panel() {
  const wrapper = mount(CallLogPanel, {
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
  });
  panels.push(wrapper);
  return wrapper;
}
afterEach(() => {
  for (const wrapper of panels) if (wrapper.exists()) wrapper.unmount();
  panels.length = 0;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});
async function setScope(
  wrapper: ReturnType<typeof mount>,
  scope: 'AUDIT' | 'OWN',
) {
  const select = wrapper
    .findAllComponents(ElSelectV2)
    .find((control) =>
      (control.props().options as { value?: unknown }[]).some(
        (option) => option.value === 'AUDIT',
      ),
    );
  if (!select) throw new Error('Missing native scope select');
  select.vm.$emit('update:modelValue', scope);
  select.vm.$emit('change', scope);
  await flushPromises();
}
beforeEach(() => {
  vi.clearAllMocks();
  state.access = reactive({
    accessToken: 'session-one',
    accessCodes: [
      'ai:request:list',
      'ai:request:query',
      'ai:request:export',
      'ai:request:audit',
    ],
  });
  api.list.mockResolvedValue({
    records: [row],
    total: '1',
    pageNum: 1,
    pageSize: 20,
  });
  api.stats.mockResolvedValue(counts);
  api.detail.mockResolvedValue({ call: row, response });
  api.export.mockResolvedValue([row]);
});
describe('call log isolation and exact rendering', () => {
  it('keeps safe headers and usage readable when the response body was not archived', async () => {
    const wrapper = mount(CallLogDetail, {
      props: {
        detail: {
          call: { ...row, truncated: true, captureStatus: 'PARTIAL' },
          response: {
            ...response,
            body: null,
            headers: { 'content-type': 'application/json' },
            usage: { unknownExtension: '9007199254740993123' },
          },
        },
      },
    });
    expect(wrapper.text()).toContain('正文未归档');
    expect(wrapper.text()).toContain('已截断');
    expect(wrapper.text()).toContain('application/json');
    expect(wrapper.text()).toContain('9007199254740993123');
    expect(wrapper.find('[aria-label="上游响应正文"]').exists()).toBe(false);
    await wrapper.setProps({
      detail: {
        call: row,
        response: { ...response, body: null, headers: null, usage: null },
      },
    });
    expect(wrapper.get('[aria-label="安全响应头"]').text()).toBe('未采集');
    expect(wrapper.get('[aria-label="用量扩展"]').text()).toBe('未采集');
    wrapper.unmount();
  });
  it('keeps technical filters and diagnostics collapsed, opens a side dialog and closes with Escape', async () => {
    const wrapper = panel();
    await flushPromises();
    expect(wrapper.find('form').exists()).toBe(true);
    expect(wrapper.find('.vxe-grid').exists()).toBe(true);
    await click(wrapper, '详情');
    const target = document.querySelector('[role="dialog"]');
    if (!target) throw new Error('Missing native drawer');
    const dialog = new DOMWrapper(target);
    expect(dialog.attributes('data-state')).toBe('open');
    expect(dialog.find('.el-collapse-item__content').isVisible()).toBe(false);
    expect(dialog.findAll('.el-descriptions')).toHaveLength(3);
    await vi.waitFor(() =>
      expect(document.activeElement?.closest('[role="dialog"]')).toBe(target),
    );
    await dialog.trigger('keydown', { key: 'Escape' });
    await flushPromises();
    await vi.waitFor(() =>
      expect(
        document.querySelector('[role="dialog"][data-state="open"]'),
      ).toBeNull(),
    );
    expect(document.body.textContent).not.toContain('private response');
    wrapper.unmount();
  });
  it('rejects totals that cannot be represented safely by the native pager', async () => {
    api.list.mockResolvedValueOnce({
      records: [row],
      total: '9007199254740993123',
      pageNum: 1,
      pageSize: 20,
    });
    const wrapper = panel();
    await flushPromises();
    expect(wrapper.text()).toContain('超出可安全分页范围');
    expect(wrapper.find('.vxe-body--row').exists()).toBe(false);
    wrapper.unmount();
  });
  it('exports only structured row fields without an attached body or precision loss', () => {
    const records = structuredRows([
      { ...row, response, body: 'private' } as CallLogRow,
    ]);
    expect(JSON.stringify(records)).not.toContain('private');
    expect(JSON.stringify(records)).not.toContain('response"');
    expect(records[0]?.inputTokens).toBe('9007199254740993123');
    expect(records[0]?.reportedCost).toBe('0.0000000000000000123');
  });
  it('shows upstream counts, exact longs/cost and real zero without claiming known totals', async () => {
    const wrapper = panel();
    await flushPromises();
    expect(wrapper.text()).toContain('9007199254740993123');
    expect(wrapper.text()).toContain('0.0000000000000000123 USD');
    expect(wrapper.text()).toContain('已知输入 Token未知');
    expect(wrapper.find('.vxe-body--row').text()).toContain(
      '9007199254740993123',
    );
    expect(wrapper.find('.vxe-body--row').text()).toContain('0');
    expect(api.list).toHaveBeenCalledWith({
      scope: 'OWN',
      from: undefined,
      to: undefined,
      pageNum: 1,
      pageSize: 20,
    });
    await click(wrapper, '同一请求');
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 'request-one' }),
    );
    wrapper.unmount();
  });
  it('discards late list/statistics after logout and makes no read without permission', async () => {
    const pending = deferred<AiPage<CallLogRow>>();
    api.list.mockReturnValueOnce(pending.promise);
    const wrapper = panel();
    state.access.accessToken = '';
    await flushPromises();
    pending.resolve({ records: [row], total: '1', pageNum: 1, pageSize: 20 });
    await flushPromises();
    expect(wrapper.find('tbody tr').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('9007199254740993123');
    wrapper.unmount();
    vi.clearAllMocks();
    state.access.accessCodes = [];
    const denied = panel();
    await flushPromises();
    expect(denied.text()).toContain('没有请求日志查看权限');
    expect(api.list).not.toHaveBeenCalled();
    denied.unmount();
  });
  it('clears private detail on query permission revocation and ignores late body', async () => {
    const pending = deferred<Detail>();
    api.detail.mockReturnValueOnce(pending.promise);
    const wrapper = panel();
    await flushPromises();
    await click(wrapper, '详情');
    state.access.accessCodes = ['ai:request:list'];
    await flushPromises();
    pending.resolve({ call: row, response });
    await flushPromises();
    expect(document.body.textContent).not.toContain('private response');
    expect(wrapper.find('[aria-label="交互详情"]').exists()).toBe(false);
    wrapper.unmount();
  });
  it('scope changes clear previous body, remove audit filters and drop late export', async () => {
    const pending = deferred<CallLogRow[]>();
    api.export.mockReturnValueOnce(pending.promise);
    const create = vi.fn();
    const NativeURL = globalThis.URL;
    vi.stubGlobal(
      'URL',
      class extends NativeURL {
        static override createObjectURL = create;
        static override revokeObjectURL = vi.fn();
      },
    );
    const wrapper = panel();
    await flushPromises();
    await setScope(wrapper, 'AUDIT');
    await wrapper.get('[aria-label="租户"]').setValue('other');
    await click(wrapper, '查询');
    await click(wrapper, '详情');
    expect(document.body.textContent).toContain('private response');
    await click(wrapper, '导出结构化日志');
    await setScope(wrapper, 'OWN');
    expect(document.body.textContent).not.toContain('private response');
    pending.resolve([row]);
    await flushPromises();
    expect(create).not.toHaveBeenCalled();
    await click(wrapper, '查询');
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        scope: 'OWN',
        tenantRef: undefined,
        subjectRef: undefined,
      }),
    );
    wrapper.unmount();
    vi.unstubAllGlobals();
  });
  it('clears on pane hiding and discards late detail, and does not fetch URLs or render response HTML', async () => {
    const pending = deferred<Detail>();
    api.detail.mockReturnValueOnce(pending.promise);
    const wrapper = panel();
    await flushPromises();
    await click(wrapper, '详情');
    await wrapper.setProps({ active: false });
    pending.resolve({ call: row, response });
    await flushPromises();
    expect(document.body.textContent).not.toContain('private response');
    wrapper.unmount();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const detail = mount(CallLogDetail, {
      props: {
        detail: {
          call: row,
          response: {
            ...response,
            body: '<img src="https://invalid.test/track"><script>alert(1)</script>',
          },
        },
      },
    });
    expect(detail.find('img').exists()).toBe(false);
    expect(detail.find('script').exists()).toBe(false);
    expect(detail.text()).toContain('<img src=');
    expect(fetcher).not.toHaveBeenCalled();
    await detail.setProps({
      detail: { call: { ...row, responseAvailable: false }, response },
    });
    expect(detail.text()).not.toContain('private response');
    detail.unmount();
    vi.unstubAllGlobals();
  });
  it('keeps missing, unmeasurable, scan and zero distinct; formats JSON losslessly and leaves SSE ordered', () => {
    expect(exact(null)).toBe('未采集');
    expect(exact(0)).toBe('0');
    expect(outputTime({ ...row, streaming: false })).toBe('不可测');
    expect(outputTime({ ...row, streaming: true, firstOutputMs: '0' })).toBe(
      '0 ms',
    );
    expect(tokenValue({ ...row, entryType: 'MODEL_DISCOVERY' }, null)).toBe(
      '不适用',
    );
    const json = String.raw`{"n":9007199254740993123,"cost":0.0000000000000000123,"s":"a\"b"}`;
    expect(responseText(json, 'JSON')).toContain('9007199254740993123');
    expect(responseText(json, 'JSON')).toContain('0.0000000000000000123');
    expect(responseText('broken {', 'JSON')).toBe('broken {');
    expect(responseText(response.body, 'SSE')).toBe(response.body);
  });
});
