import { mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getJobLog, getJobLogList } from '#/api/monitor/jobLog';

import JobLogPage from './index.vue';

interface GridQuery {
  gridOptions: {
    proxyConfig: {
      ajax: {
        query: (params: unknown, values: unknown) => Promise<unknown>;
      };
    };
  };
  tableTitle?: string;
}
const state = vi.hoisted(() => ({
  options: undefined as GridQuery | undefined,
  codes: ['monitor:jobLog:list', 'monitor:jobLog:query'],
  live: undefined as
    | undefined
    | {
        field: string | undefined;
        order: 'asc' | 'desc' | undefined;
        page: number;
        values: Record<string, unknown>;
      },
}));
vi.mock('@vben/common-ui', () => ({
  Page: { template: '<div><slot /></div>' },
  useVbenModal: () => [
    { template: '<div />' },
    { setState: () => {}, open: () => {}, close: async () => {} },
  ],
}));
vi.mock('@vben/stores', () => ({
  useAccessStore: () => ({
    accessCodes: state.codes,
    accessToken: 'token',
  }),
}));
vi.mock('#/adapter/form', () => ({ useVbenForm: vi.fn(), z: {} }));
vi.mock('#/adapter/vxe-table', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/adapter/vxe-table')>();
  return {
    ...actual,
    useVbenVxeGrid: (options: GridQuery) => {
      state.options = options;
      return [
        { template: '<div />' },
        {
          grid: {
            getCurrentPage: () => state.live?.page ?? 1,
            getPageSize: () => 10,
            getSortColumns: () => [
              { field: state.live?.field, order: state.live?.order },
            ],
            setCurrentPage: async (page: number) => {
              if (state.live) state.live.page = page;
            },
            getCheckboxRecords: () => [],
            clearCheckboxRow: async () => {},
          },
          formApi: {
            getLatestSubmissionValues: () => state.live?.values ?? {},
          },
        },
      ];
    },
  };
});
vi.mock('#/api/monitor/jobLog', () => ({
  getJobLogList: vi.fn(),
  getJobLog: vi.fn(),
  removeJobLog: vi.fn(),
  cleanJobLog: vi.fn(),
}));

function query(
  page = 1,
  field = 'fireId',
  order: 'asc' | 'desc' | null = 'desc',
  values: Record<string, unknown> = {},
) {
  if (!state.options) throw new Error('执行记录原生Grid未初始化');
  // createVbenGridQuery 从原生 Grid 状态读取查询条件，不走 proxy 参数。
  state.live = { field, order: order ?? undefined, page, values };
  return state.options.gridOptions.proxyConfig.ajax.query({}, {});
}

beforeEach(() => {
  vi.resetAllMocks();
  state.options = undefined;
  state.live = undefined;
  state.codes = ['monitor:jobLog:list', 'monitor:jobLog:query'];
});

describe('调度日志原生Grid查询合同', () => {
  it('sends whitelisted sort and ledger filters to the server', async () => {
    mount(JobLogPage);
    vi.mocked(getJobLogList).mockResolvedValue({
      records: [],
      total: 41,
      pageNum: 1,
      pageSize: 10,
    });
    await query(3, 'startedAt', 'asc', {
      jobId: ' 12 ',
      jobName: '清理',
      status: 'FAILED',
      triggerType: 'MANUAL',
    });
    expect(getJobLogList).toHaveBeenCalledWith({
      pageNum: 3,
      pageSize: 10,
      jobId: '12',
      jobName: '清理',
      status: 'FAILED',
      triggerType: 'MANUAL',
      orderBy: 'startedAt',
      order: 'asc',
    });
  });

  it('keeps the fire ledger default order when the header sort is cleared', async () => {
    mount(JobLogPage);
    vi.mocked(getJobLogList).mockResolvedValue({
      records: [],
      total: 0,
      pageNum: 1,
      pageSize: 10,
    });
    await query(1, 'status', null);
    expect(getJobLogList).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: 'fireId', order: 'desc' }),
    );
  });

  it('does not forward an unsortable column to the server', async () => {
    mount(JobLogPage);
    vi.mocked(getJobLogList).mockResolvedValue({
      records: [],
      total: 0,
      pageNum: 1,
      pageSize: 10,
    });
    await query(1, 'traceId', 'asc');
    expect(getJobLogList).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: 'fireId', order: 'desc' }),
    );
  });

  it('does not issue a ledger request without the list permission', async () => {
    state.codes = [];
    mount(JobLogPage);
    expect(await query()).toEqual({ items: [], total: 0 });
    expect(getJobLogList).not.toHaveBeenCalled();
    expect(getJobLog).not.toHaveBeenCalled();
  });
});
