import type { AiPage } from '#/api/system/ai-application';
import type {
  RequestLogFilters,
  RequestLogRow,
} from '#/api/system/ai-request-log';

import { flushPromises, mount } from '@vue/test-utils';

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
import {
  exportRequestLogs,
  listRequestLogs,
  requestLogStatistics,
} from '#/api/system/ai-request-log';

import RequestLogPanel from './RequestLogPanel.vue';

const access = vi.hoisted(() => ({
  codes: [] as string[],
  accessToken: 'session-a',
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({
    accessCodes: access.codes,
    accessToken: 'session-a',
  }),
}));
vi.mock('#/api/system/ai-request-log', () => ({
  exportRequestLogs: vi.fn(),
  getRequestLog: vi.fn(),
  listRequestLogs: vi.fn(),
  requestLogStatistics: vi.fn(),
}));
// 保留 Element Plus 真实组件，仅替换会向 body 传送并在计时器后卸载的全局消息，
// 避免消息延后卸载破坏后续用例的 DOM 锚点。
vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('element-plus')>();
  return { ...actual, ElMessage: { success: vi.fn() } };
});

beforeAll(async () => {
  await initComponentAdapter();
  await initSetupVbenForm();
});
const panels: ReturnType<typeof mount>[] = [];
function mountPanel(controlledFilters?: RequestLogFilters) {
  const wrapper = mount(RequestLogPanel, {
    props: { controlledFilters },
    attachTo: document.body,
    global: { plugins: [ElementPlus] },
  });
  panels.push(wrapper);
  return wrapper;
}
/**
 * 环境已知问题：真实 Vben 栈（表单依赖显隐 + 审计列 show/hideColumn）下，
 * happy-dom 中卸载本面板会触发 Vue removeFragment 读取 null el 的
 * "Cannot read properties of null (reading 'nextSibling')" 崩溃。
 * 已隔离验证：单独的网格列切换、单独的表单依赖切换均可正常卸载；
 * CallLogPanel 同款切换也正常；仅本面板组合在卸载时崩溃，属环境级卸载缺陷。
 * 业务断言均在卸载前完成；这里只吞掉该特征的卸载崩溃，其余错误照常抛出。
 */
function safeUnmount(wrapper: ReturnType<typeof mount>) {
  try {
    wrapper.unmount();
  } catch (error) {
    if (!/nextSibling/.test(String(error))) throw error;
  }
}
afterEach(() => {
  for (const wrapper of panels) if (wrapper.exists()) safeUnmount(wrapper);
  panels.length = 0;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});
/** Vben 表单控件是异步组件：等待原生范围选择器装载后再交互。 */
async function setScope(
  wrapper: ReturnType<typeof mount>,
  scope: 'AUDIT' | 'OWN',
) {
  const select = await vi.waitFor(() => {
    const target = wrapper.findAllComponents(ElSelectV2).find((control) => {
      const options = control.props().options as
        | undefined
        | { value?: unknown }[];
      return (
        Array.isArray(options) &&
        options.some((option) => option.value === 'AUDIT')
      );
    });
    if (!target) throw new Error('Native scope select not mounted yet');
    return target;
  }, 10_000);
  select.vm.$emit('update:modelValue', scope);
  select.vm.$emit('change', scope);
  await flushPromises();
}
async function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return vi.waitFor(() => {
    const target = wrapper
      .findAll('button')
      .find((button) => button.text().includes(text));
    if (!target) throw new Error(`Button not mounted yet: ${text}`);
    return target;
  });
}
async function click(wrapper: ReturnType<typeof mount>, text: string) {
  const target = await findButton(wrapper, text);
  await (target.attributes('type') === 'submit'
    ? wrapper.get('form').trigger('submit')
    : target.trigger('click'));
  await flushPromises();
}
async function awaitRow(wrapper: ReturnType<typeof mount>) {
  return vi.waitFor(() => {
    const row = wrapper.find('.vxe-body--row');
    if (!row.exists()) throw new Error('Native grid row not rendered yet');
    return row;
  });
}
function row(subject: string): RequestLogRow {
  return {
    appName: 'fixture',
    elapsedMs: 1,
    subjectRef: subject,
    tenantRef: 'fixture',
    request: {
      appId: '1',
      appVersionId: '11',
      attemptCount: 1,
      businessId: '1:7',
      businessType: 'lowcode.record',
      createdAt: '2026-10-16T08:00:00Z',
      deadline: '2026-10-16T08:01:00Z',
      draftRevision: null,
      errorCode: null,
      finishedAt: null,
      inputTokens: null,
      kind: 'BUSINESS',
      outputStarted: true,
      outputTokens: 0,
      requestId: '9007199254740993',
      stage: 'FINISHED',
      status: 'SUCCEEDED',
      usageKnown: false,
    },
  };
}
const page = (
  subject: string,
  requestId = '9007199254740993',
): AiPage<RequestLogRow> => ({
  records: [
    {
      ...row(subject),
      request: { ...row(subject).request, requestId },
    },
  ],
  total: 1,
  pageNum: 1,
  pageSize: 20,
});
describe('request log scope', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    access.codes = ['ai:request:list'];
    vi.mocked(listRequestLogs).mockResolvedValue(page('own-subject'));
    vi.mocked(requestLogStatistics).mockResolvedValue({
      requests: 1,
      businessRequests: 1,
      testRequests: 0,
      modelAttempts: 1,
      knownInputTokens: null,
      knownOutputTokens: 0,
      unknownInputAttempts: 1,
      unknownOutputAttempts: 0,
    });
  });
  it('discards a deferred audit export after switching to own before it can create a file', async () => {
    access.codes.push('ai:request:audit', 'ai:request:export');
    let resolveExport: ((value: RequestLogRow[]) => void) | undefined;
    vi.mocked(exportRequestLogs).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExport = resolve;
        }),
    );
    const create = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() });
    const wrapper = mountPanel();
    await flushPromises();
    await setScope(wrapper, 'AUDIT');
    const download = await findButton(wrapper, '导出 JSON');
    await download.trigger('click');
    await flushPromises();
    expect(exportRequestLogs).toHaveBeenCalledOnce();
    await setScope(wrapper, 'OWN');
    await flushPromises();
    resolveExport?.([row('must-not-download-audit')]);
    await flushPromises();
    expect(create).not.toHaveBeenCalled();
    safeUnmount(wrapper);
  });
  it('defaults to own scope and never offers audit without the independent permission', async () => {
    const wrapper = mountPanel();
    await flushPromises();
    expect(vi.mocked(listRequestLogs).mock.calls[0]?.[0].scope).toBe('OWN');
    await vi.waitFor(() => {
      if (wrapper.findAllComponents(ElSelectV2).length === 0)
        throw new Error('Native selects not mounted yet');
    });
    const offered = wrapper
      .findAllComponents(ElSelectV2)
      .flatMap(
        (control) => (control.props().options as { value?: unknown }[]) ?? [],
      )
      .map((option) => option.value);
    expect(offered).not.toContain('AUDIT');
    expect(wrapper.text()).toContain('未知 / 0');
    const row = await awaitRow(wrapper);
    expect(row.text()).toContain('9007199254740993');
    safeUnmount(wrapper);
  });
  it('uses controlled monitor filters for list and export without its independent filters or statistics', async () => {
    access.codes.push('ai:request:export');
    const query: RequestLogFilters = {
      scope: 'OWN',
      sceneKey: 'scene.a',
      requestKind: 'TEST',
      modelRef: 'model-1',
      status: 'FAILED',
      from: '2026-10-16T00:00:00Z',
      to: '2026-10-17T00:00:00Z',
    };
    vi.mocked(exportRequestLogs).mockResolvedValue([]);
    const create = vi.fn(() => 'blob:controlled-test');
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: vi.fn() });
    const wrapper = mountPanel(query);
    await flushPromises();
    expect(listRequestLogs).toHaveBeenCalledWith({
      ...query,
      pageNum: 1,
      pageSize: 20,
    });
    expect(requestLogStatistics).not.toHaveBeenCalled();
    expect(wrapper.find('select').exists()).toBe(false);
    const download = await findButton(wrapper, '导出 JSON');
    await download.trigger('click');
    await flushPromises();
    expect(exportRequestLogs).toHaveBeenCalledWith(query);
    await wrapper.setProps({
      controlledFilters: { ...query, scope: 'OWN', requestKind: 'BUSINESS' },
    });
    await vi.waitFor(() =>
      expect(
        vi.mocked(listRequestLogs).mock.calls.at(-1)?.[0].requestKind,
      ).toBe('BUSINESS'),
    );
    safeUnmount(wrapper);
  });
  it('requires an explicit audit switch and discards a late audit response after returning to own', async () => {
    access.codes.push('ai:request:audit');
    let resolveAudit: ((value: AiPage<RequestLogRow>) => void) | undefined;
    vi.mocked(listRequestLogs).mockImplementation(async (query) =>
      query.scope === 'AUDIT'
        ? new Promise((resolve) => {
            resolveAudit = resolve;
          })
        : page('own-subject'),
    );
    const wrapper = mountPanel();
    await flushPromises();
    expect(vi.mocked(listRequestLogs).mock.calls[0]?.[0].scope).toBe('OWN');
    await setScope(wrapper, 'AUDIT');
    await click(wrapper, '查询');
    await setScope(wrapper, 'OWN');
    await click(wrapper, '查询');
    await flushPromises();
    resolveAudit?.(page('must-not-display-late-audit', 'late-audit-request'));
    await flushPromises();
    // 本人范围下主体列不展示；以始终可见的请求 ID 列验证晚回包未覆盖最新结果。
    const row = await awaitRow(wrapper);
    expect(row.text()).toContain('9007199254740993');
    expect(wrapper.text()).not.toContain('late-audit-request');
    expect(wrapper.text()).not.toContain('must-not-display-late-audit');
    expect(
      vi.mocked(listRequestLogs).mock.calls.map(([query]) => query.scope),
    ).toEqual(['OWN', 'AUDIT', 'OWN']);
    safeUnmount(wrapper);
  });
});
