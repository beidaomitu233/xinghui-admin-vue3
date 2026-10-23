import { mount } from '@vue/test-utils';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getOperLogList } from '#/api/monitor/operlog';

import OperLogPage from './index.vue';

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
  codes: ['monitor:operlog:list'],
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
      if (options.tableTitle === '操作日志') state.options = options;
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
vi.mock('#/api/monitor/operlog', () => ({
  getOperLogList: vi.fn(),
  removeOperLog: vi.fn(),
  cleanOperLog: vi.fn(),
}));

function query(
  page = 1,
  field = 'operTime',
  order: 'asc' | 'desc' | null = 'desc',
  values: Record<string, unknown> = {},
) {
  if (!state.options) throw new Error('操作日志原生Grid未初始化');
  // createVbenGridQuery 从原生 Grid 状态读取查询条件，不走 proxy 参数。
  state.live = { field, order: order ?? undefined, page, values };
  return state.options.gridOptions.proxyConfig.ajax.query({}, {});
}

beforeEach(() => {
  vi.resetAllMocks();
  state.options = undefined;
  state.live = undefined;
  state.codes = ['monitor:operlog:list'];
});

describe('操作日志原生Grid查询合同', () => {
  it('sends whitelisted sort and business filters as typed values', async () => {
    mount(OperLogPage);
    vi.mocked(getOperLogList).mockResolvedValue({ records: [], total: 19 });
    await query(2, 'costTime', 'asc', {
      title: ' 登录 ',
      operName: 'admin',
      businessType: 1,
      status: 0,
    });
    expect(getOperLogList).toHaveBeenCalledWith({
      pageNum: 2,
      pageSize: 10,
      title: '登录',
      operName: 'admin',
      businessType: 1,
      status: 0,
      orderBy: 'costTime',
      order: 'asc',
    });
  });

  it('omits empty optional filters instead of sending blanks', async () => {
    mount(OperLogPage);
    vi.mocked(getOperLogList).mockResolvedValue({ records: [], total: 0 });
    await query(1, 'operTime', 'desc', {
      title: '',
      operName: '',
      businessType: '',
      status: '',
    });
    expect(getOperLogList).toHaveBeenCalledWith({
      pageNum: 1,
      pageSize: 10,
      orderBy: 'operTime',
      order: 'desc',
    });
  });

  it('restores the server default when the header sort is cleared', async () => {
    mount(OperLogPage);
    vi.mocked(getOperLogList).mockResolvedValue({ records: [], total: 0 });
    await query(1, 'title', null);
    expect(getOperLogList).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: 'operTime', order: 'desc' }),
    );
  });

  it('does not issue a list request without the list permission', async () => {
    state.codes = [];
    mount(OperLogPage);
    expect(await query()).toEqual({ items: [], total: 0 });
    expect(getOperLogList).not.toHaveBeenCalled();
  });
});
